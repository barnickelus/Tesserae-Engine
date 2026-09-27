/*
  tessera-forge proxy — lets examples/tessera-forge.html call OpenAI without an
  API key ever reaching the browser.

  The key lives here, as a Worker secret. What the browser holds is this
  Worker's URL, which is not a secret — and that is exactly why most of this
  file is limits. A URL that spends money on behalf of whoever calls it has to
  decide, on its own, how much and for whom.

  WHAT IT ENFORCES
    · Origin. ALLOWED_ORIGIN is required (it refuses to run without it) and a
      POST must carry a matching Origin header. That stops other websites from
      using the proxy through their visitors' browsers. It does NOT stop a
      script — curl can send any Origin it likes — so it is a filter, not
      authentication.
    · A daily dollar budget and a per-IP rate limit, kept in a Durable Object
      (strongly consistent, and on the free plan). Each call reserves its
      worst case — estimated input plus max_output_tokens, at the model's list
      rate — before it goes upstream, and settles to the real cost from
      `usage` afterwards, so concurrent calls can't jointly overshoot the cap.
    · ACCESS_CODE, an optional secret. When set, callers must send it. Use it
      when the URL is for you and whoever you give the code to.
    · A narrow relay. The upstream request is built here — the forced
      apply_patch tool, store:false, a capped max_output_tokens, an
      allowlisted model — request sizes are capped, and the reply is trimmed
      to the function call and usage. It is not a general-purpose model
      endpoint with someone else's card behind it.
    With neither the ledger nor an access code configured, it refuses to
    spend at all: an unprotected paid endpoint is not a default.

  ENDPOINTS
    POST /         { prompt, instructions, model, tool } → trimmed /v1/responses body
    GET  /health   configuration and today's spend; never spends. ?deep=1 also
                   checks the key and model upstream (GET /v1/models/{id},
                   which OpenAI doesn't bill).

  Deploy: docs/tessera-forge-openai-integration.md. Tests: workers/test/.
*/
import { DurableObject } from 'cloudflare:workers';

const TOOL_NAME = 'apply_patch';
const OPENAI = 'https://api.openai.com/v1';

/* USD per 1M tokens, [input, output]: OpenAI's standard list rates as
   published at developers.openai.com/api/docs/pricing on 2026-09-27.
   Reasoning tokens bill as output. Cached-input discounts are ignored, so
   recorded spend reads high rather than low. Override with the MODELS var
   (same JSON shape) rather than editing this file. */
const DEFAULT_MODELS = {
  'gpt-5-mini': [0.25, 2.00],
  'gpt-5':      [1.25, 10.00],
  'gpt-5-nano': [0.05, 0.40],
  'gpt-6-luna': [0.10, 0.50],
  'gpt-6-sol':  [2.00, 10.00],
};

const LIMITS = { body: 64 * 1024, prompt: 4000, instructions: 24000, tool: 8000 };
/* Reservation assumes ~3 characters per token, which over-counts English and
   JSON (closer to 4) — reservations err high, settlements are exact. */
const CHARS_PER_TOKEN = 3;

function config(env) {
  let models = DEFAULT_MODELS, modelsVarBroken = false;
  if (env.MODELS) {
    try {
      const parsed = Object.entries(JSON.parse(env.MODELS))
        .filter(([, r]) => Array.isArray(r) && r.length === 2 && r.every(x => Number.isFinite(x) && x >= 0));
      if (parsed.length) models = Object.fromEntries(parsed); else modelsVarBroken = true;
    } catch { modelsVarBroken = true; }   // keep the built-in table; /health says so
  }
  const origins = String(env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);
  const defaultModel = models[env.DEFAULT_MODEL] ? env.DEFAULT_MODEL : Object.keys(models)[0];
  return {
    models, origins, defaultModel,
    budget: Math.max(0, parseFloat(env.DAILY_BUDGET_USD ?? '1')) || 0,
    perMinute: Math.max(0, parseInt(env.RATE_LIMIT_PER_MINUTE ?? '8', 10)) || 0,
    maxOutput: Math.min(32000, Math.max(256, parseInt(env.MAX_OUTPUT_TOKENS ?? '8000', 10) || 8000)),
    effort: env.REASONING_EFFORT || '',   // model-dependent values; unset = the model's own default
    modelsVarBroken,
  };
}

export default {
  async fetch(request, env) {
    const cfg = config(env);
    const origin = request.headers.get('origin') || '';
    const cors = corsHeaders(cfg, origin);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) return health(request, env, cfg, cors, url, origin);
    if (request.method !== 'POST') return fail(405, 'method_not_allowed', 'POST a patch request, or GET /health.', cors);
    return patch(request, env, cfg, cors, origin);
  },
};

/* ── POST: one patch ──────────────────────────────────────────────────── */

async function patch(request, env, cfg, cors, origin) {
  const problem = setupProblem(env, cfg);
  if (problem) return fail(problem.status, problem.code, problem.message, cors);
  if (!origin) return fail(403, 'origin_required', 'Requests must come from the Forge page (no Origin header).', cors);
  if (!cfg.origins.includes(origin)) return fail(403, 'origin_not_allowed', `Origin ${origin} is not in ALLOWED_ORIGIN.`, cors);
  const denied = await checkAccessCode(request, env);
  if (denied) return fail(401, denied.code, denied.message, cors);

  const len = +(request.headers.get('content-length') || 0);
  if (len > LIMITS.body) return fail(413, 'too_large', 'Request body is too large.', cors);
  const raw = await request.text();
  if (raw.length > LIMITS.body) return fail(413, 'too_large', 'Request body is too large.', cors);
  let body;
  try { body = JSON.parse(raw); } catch { return fail(400, 'bad_json', 'Body is not valid JSON.', cors); }

  const { prompt, instructions, tool } = body || {};
  if (typeof prompt !== 'string' || !prompt.trim()) return fail(400, 'bad_request', '`prompt` must be a non-empty string.', cors);
  if (typeof instructions !== 'string' || !instructions.trim()) return fail(400, 'bad_request', '`instructions` must be a non-empty string.', cors);
  if (!tool || tool.name !== TOOL_NAME) return fail(400, 'bad_request', `\`tool\` must be the ${TOOL_NAME} tool.`, cors);
  const schema = tool.input_schema || tool.parameters;
  if (!schema || typeof schema !== 'object') return fail(400, 'bad_request', '`tool` needs an input_schema.', cors);
  const toolJson = JSON.stringify({ description: tool.description || '', schema });
  if (prompt.length > LIMITS.prompt) return fail(413, 'too_large', `\`prompt\` is over ${LIMITS.prompt} characters.`, cors);
  if (instructions.length > LIMITS.instructions) return fail(413, 'too_large', `\`instructions\` is over ${LIMITS.instructions} characters.`, cors);
  if (toolJson.length > LIMITS.tool) return fail(413, 'too_large', 'The tool definition is too large.', cors);

  const substituted = !cfg.models[body.model];
  const model = substituted ? cfg.defaultModel : body.model;
  const [rateIn, rateOut] = cfg.models[model];
  const estIn = Math.ceil((prompt.length + instructions.length + toolJson.length) / CHARS_PER_TOKEN);
  const hold = (estIn * rateIn + cfg.maxOutput * rateOut) / 1e6;

  const ledger = ledgerOf(env), day = utcDay();
  if (ledger) {
    const r = await ledger.reserve({ who: clientKey(request), usd: hold, perMinute: cfg.perMinute, budget: cfg.budget, day, now: Date.now() });
    if (!r.ok) return fail(429, r.code, r.message, { ...cors, 'retry-after': String(r.retryAfter) });
  }

  let res, data;
  try {
    res = await fetch(`${OPENAI}/responses`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model, instructions, input: prompt, store: false,
        max_output_tokens: cfg.maxOutput,
        tools: [{ type: 'function', name: TOOL_NAME, description: tool.description || '', parameters: schema, strict: false }],
        tool_choice: { type: 'function', name: TOOL_NAME },
        ...(cfg.effort ? { reasoning: { effort: cfg.effort } } : {}),
      }),
    });
    data = await res.json().catch(() => ({}));
  } catch (e) {
    // The request may or may not have been processed upstream, so the
    // reservation is kept as spent — the cap errs toward holding.
    if (ledger) await ledger.settle({ day, held: hold, usd: hold });
    return fail(502, 'upstream_unreachable', `Could not reach OpenAI: ${e.message}`, cors);
  }

  if (!res.ok) {
    if (ledger) await ledger.settle({ day, held: hold, usd: 0 });   // failed calls aren't billed
    const why = data?.error?.message || res.statusText || 'unknown error';
    if (res.status === 401 || res.status === 403) return fail(502, 'worker_key_rejected', `OpenAI rejected this Worker's OPENAI_API_KEY: ${why}`, cors);
    if (res.status === 404) return fail(502, 'model_unavailable', `OpenAI has no model "${model}" for this key: ${why}`, cors);
    return fail(res.status === 429 ? 429 : 502, 'upstream_error', `OpenAI ${res.status}: ${why}`, cors);
  }

  const u = data.usage || {};
  const cost = ((u.input_tokens || 0) * rateIn + (u.output_tokens || 0) * rateOut) / 1e6;
  const spent = ledger ? (await ledger.settle({ day, held: hold, usd: cost })).spent : null;
  const calls = (data.output || [])
    .filter(o => o.type === 'function_call' && o.name === TOOL_NAME)
    .map(o => ({ type: o.type, name: o.name, call_id: o.call_id, arguments: o.arguments }));
  if (!calls.length) {
    const reason = data.incomplete_details?.reason;
    return fail(502, 'no_patch', reason === 'max_output_tokens'
      ? `The model used its whole ${cfg.maxOutput}-token budget (reasoning included) before writing a patch. Try a narrower request, or raise MAX_OUTPUT_TOKENS.`
      : `The model finished without calling ${TOOL_NAME}${reason ? ` (${reason})` : ''}.`, cors);
  }
  return json(200, {
    id: data.id, model: data.model || model, status: data.status, usage: data.usage, output: calls,
    forge: { costUsd: round6(cost), spentTodayUsd: spent === null ? null : round6(spent), budgetUsd: ledger ? cfg.budget : null, substituted },
  }, cors);
}

/* ── GET /health: what this deployment is, without spending ────────────── */

async function health(request, env, cfg, cors, url, origin) {
  const ledger = ledgerOf(env), problem = setupProblem(env, cfg);
  const codeState = env.ACCESS_CODE ? (request.headers.get('x-forge-access') ? !(await checkAccessCode(request, env)) : null) : null;
  const today = ledger ? await ledger.status({ day: utcDay() }) : null;
  const out = {
    ok: !problem, service: 'tessera-forge-proxy', version: 2,
    problem: problem ? problem.message : null,
    keyConfigured: !!env.OPENAI_API_KEY,
    models: Object.keys(cfg.models), defaultModel: cfg.defaultModel, maxOutputTokens: cfg.maxOutput,
    protections: {
      origins: cfg.origins,
      originAllowed: origin ? cfg.origins.includes(origin) : null,
      accessCode: env.ACCESS_CODE ? 'required' : 'off',
      accessCodeAccepted: codeState,
      rateLimitPerMinute: ledger ? cfg.perMinute : null,
      dailyBudgetUsd: ledger ? cfg.budget : null,
      spentTodayUsd: today ? round6(today.spent) : null,
      resetsAt: new Date(Date.parse(utcDay()) + 864e5).toISOString(),
    },
  };
  if (cfg.modelsVarBroken) out.warning = 'MODELS is not a valid {"model": [inputUsd, outputUsd]} table; using the built-in one.';

  if (url.searchParams.get('deep') === '1') {
    const model = cfg.models[url.searchParams.get('model')] ? url.searchParams.get('model') : cfg.defaultModel;
    // Only for callers who could send a patch anyway, and counted against their rate.
    if (problem) out.upstream = { checked: false, reason: problem.message };
    else if (!origin || !cfg.origins.includes(origin)) out.upstream = { checked: false, reason: 'Origin not allowed.' };
    else if (env.ACCESS_CODE && codeState !== true) out.upstream = { checked: false, reason: 'Access code missing or wrong.' };
    else {
      const r = ledger ? await ledger.touch({ who: clientKey(request), perMinute: cfg.perMinute, now: Date.now() }) : { ok: true };
      if (!r.ok) out.upstream = { checked: false, reason: r.message };
      else {
        try {
          const res = await fetch(`${OPENAI}/models/${encodeURIComponent(model)}`, { headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` } });
          const d = await res.json().catch(() => ({}));
          out.upstream = { checked: true, model, ok: res.ok, status: res.status,
            message: res.ok ? 'Key accepted; model available.'
              : res.status === 401 ? `OpenAI rejected the Worker's key: ${d?.error?.message || ''}`.trim()
              : res.status === 404 ? `This key can't see "${model}".`
              : d?.error?.message || res.statusText };
        } catch (e) { out.upstream = { checked: true, model, ok: false, status: 0, message: `Could not reach OpenAI: ${e.message}` }; }
      }
    }
  }
  return json(200, out, cors);
}

/* ── the ledger: daily spend + per-IP rate, one strongly consistent object ── */

export class Ledger extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.hits = new Map(); }

  /* Rate check, budget check and reservation happen in one call, and storage
     operations hold the object's input gate, so no other request interleaves
     between the read and the write. */
  async reserve({ who, usd, perMinute, budget, day, now }) {
    const rate = this.#rate(who, perMinute, now);
    if (!rate.ok) return rate;
    const rec = await this.#day(day);
    if (budget > 0 && rec.spent + rec.held + usd > budget) {
      return { ok: false, code: 'budget_exhausted', retryAfter: Math.ceil((Date.parse(day) + 864e5 - now) / 1000),
               message: `Today's budget for this Worker is used up ($${rec.spent.toFixed(4)} of $${budget.toFixed(2)}, with $${rec.held.toFixed(4)} in flight). It resets at 00:00 UTC.` };
    }
    rec.held += usd; rec.calls += 1;
    await this.ctx.storage.put(day, rec);
    return { ok: true };
  }

  async settle({ day, held, usd }) {
    const rec = await this.#day(day);
    rec.held = Math.max(0, rec.held - held);
    rec.spent += usd;
    await this.ctx.storage.put(day, rec);
    return { spent: rec.spent };
  }

  async status({ day }) { return this.#day(day); }

  async touch({ who, perMinute, now }) { return this.#rate(who, perMinute, now); }

  async #day(day) { return (await this.ctx.storage.get(day)) || { spent: 0, held: 0, calls: 0 }; }

  /* Sliding 60 s window per client. Kept in memory: if the object is evicted
     the window resets, which is acceptable because the budget is the cap
     that has to hold. */
  #rate(who, perMinute, now) {
    if (!perMinute) return { ok: true };
    const recent = (this.hits.get(who) || []).filter(t => now - t < 60000);
    if (recent.length >= perMinute) {
      this.hits.set(who, recent);
      return { ok: false, code: 'rate_limited', retryAfter: Math.max(1, Math.ceil((60000 - (now - recent[0])) / 1000)),
               message: `Too many requests — this Worker allows ${perMinute} a minute from one address.` };
    }
    recent.push(now);
    this.hits.set(who, recent);
    if (this.hits.size > 10000) this.hits.clear();   // bounded memory
    return { ok: true };
  }
}

/* ── helpers ──────────────────────────────────────────────────────────── */

function setupProblem(env, cfg) {
  if (!cfg.origins.length) return { status: 500, code: 'not_configured', message: 'ALLOWED_ORIGIN is not set, so this Worker accepts no one. Set it to the Forge page origin, e.g. https://barnickelus.github.io.' };
  if (!env.OPENAI_API_KEY) return { status: 500, code: 'not_configured', message: 'OPENAI_API_KEY is not set on this Worker.' };
  if (!ledgerOf(env) && !env.ACCESS_CODE) return { status: 503, code: 'unprotected', message: 'This Worker has no spend cap (the LEDGER binding from wrangler.toml) and no ACCESS_CODE, so it refuses to spend. Deploy with wrangler.toml, or set an ACCESS_CODE secret.' };
  return null;
}

function ledgerOf(env) { return env.LEDGER ? env.LEDGER.get(env.LEDGER.idFromName('ledger')) : null; }

async function checkAccessCode(request, env) {
  if (!env.ACCESS_CODE) return null;
  const given = request.headers.get('x-forge-access');
  if (!given) return { code: 'access_code_required', message: 'This Worker needs an access code.' };
  // compare digests, so neither the length nor the content leaks through timing
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(given)), crypto.subtle.digest('SHA-256', enc.encode(env.ACCESS_CODE))]);
  return crypto.subtle.timingSafeEqual(a, b) ? null : { code: 'access_code_wrong', message: 'That access code is not right.' };
}

/* One rate bucket per client. IPv6 users typically control a whole /64, so
   the bucket is the /64 prefix rather than the full address. */
function clientKey(request) {
  const ip = request.headers.get('cf-connecting-ip') || '';
  if (!ip.includes(':')) return ip || 'unknown';
  const [head, tail] = ip.split('::');
  const h = head ? head.split(':') : [], t = tail === undefined ? null : (tail ? tail.split(':') : []);
  const g = t === null ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  return g.slice(0, 4).map(x => (x.toLowerCase().replace(/^0+(?=.)/, '') || '0')).join(':') + '::/64';
}

/* CORS reflects any Origin. That grants nothing: the allowlist is enforced
   server-side before anything else happens to a POST, and a browser can't
   forge Origin. What reflecting buys is a READABLE refusal — a page served
   from the wrong origin sees "Origin … is not in ALLOWED_ORIGIN" instead of
   an opaque "Failed to fetch". */
function corsHeaders(cfg, origin) {
  const h = {
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-forge-access',
    'access-control-expose-headers': 'retry-after',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
  if (origin) h['access-control-allow-origin'] = origin;
  return h;
}

function utcDay() { return new Date().toISOString().slice(0, 10); }
function round6(x) { return Math.round(x * 1e6) / 1e6; }
function json(status, value, headers) {
  return new Response(JSON.stringify(value), { status, headers: { ...headers, 'content-type': 'application/json' } });
}
/* Errors use OpenAI's own shape, so the page's one error reader handles both. */
function fail(status, code, message, headers) { return json(status, { error: { code, message } }, headers); }
