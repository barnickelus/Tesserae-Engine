// Runs the Worker in workerd (via Miniflare) — the same runtime Cloudflare
// uses — with every outbound fetch intercepted, so "OpenAI" here is a script
// and nothing leaves the machine.   cd workers && npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Miniflare, Response } from 'miniflare';

const SCRIPT = fileURLToPath(new URL('../tessera-forge-openai.js', import.meta.url));
const ORIGIN = 'https://barnickelus.github.io';
const KEY = 'sk-test-SECRET-9f3a';

// the shape tessera-forge.html sends
const TOOL = { name: 'apply_patch', description: 'Apply a patch of ops to the live scene.',
  input_schema: { type: 'object', properties: { label: { type: 'string' }, ops: { type: 'array', items: { type: 'object' } } }, required: ['label', 'ops'] } };
const BODY = { prompt: 'make it golden hour', instructions: 'You modify a live Three.js scene.', model: 'gpt-5-mini', tool: TOOL };

const reply = (status, value) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const completed = (usage = { input_tokens: 1800, output_tokens: 600 }) => reply(200, {
  id: 'resp_1', model: 'gpt-5-mini-2025-08-07', status: 'completed', usage,
  output: [
    { type: 'reasoning', id: 'rs_1', summary: [] },
    { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'apply_patch',
      arguments: JSON.stringify({ label: 'golden hour', ops: [{ op: 'set', key: 'env.fog', value: 0.05 }] }) },
  ],
});

async function worker({ vars = {}, ledger = true, upstream = () => completed() } = {}, fn) {
  const calls = [];
  const bindings = { ALLOWED_ORIGIN: ORIGIN, OPENAI_API_KEY: KEY, DAILY_BUDGET_USD: '1.00', RATE_LIMIT_PER_MINUTE: '100', ...vars };
  for (const k of Object.keys(bindings)) if (bindings[k] === undefined) delete bindings[k];
  const mf = new Miniflare({
    modules: true, scriptPath: SCRIPT, compatibilityDate: '2026-07-01', bindings,
    ...(ledger ? { durableObjects: { LEDGER: { className: 'Ledger', useSQLite: true } } } : {}),
    // 'unreachable' routes every outbound request at a closed local port, so
    // the Worker's fetch() really rejects, as it would on a network failure
    outboundService: upstream === 'unreachable' ? { external: { address: '127.0.0.1:9', http: {} } } : async (req) => {
      const text = req.method === 'POST' ? await req.text() : '';
      const call = { url: req.url, method: req.method, auth: req.headers.get('authorization'), body: text ? JSON.parse(text) : null };
      calls.push(call);
      return upstream(call);
    },
  });
  const send = (body = BODY, headers = {}) => mf.dispatchFetch('http://forge.test/', {
    method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '203.0.113.7', ...headers },
  });
  const get = (path = '/health', headers = {}) => mf.dispatchFetch('http://forge.test' + path, { headers: { origin: ORIGIN, 'cf-connecting-ip': '203.0.113.7', ...headers } });
  const options = (headers = {}) => mf.dispatchFetch('http://forge.test/', { method: 'OPTIONS', headers: { origin: ORIGIN, ...headers } });
  try { await fn({ calls, send, get, options }); } finally { await mf.dispose(); }
}
const errOf = async (res) => (await res.json()).error;

test('refuses to run without ALLOWED_ORIGIN, and says why', () => worker({ vars: { ALLOWED_ORIGIN: undefined } }, async ({ send, get, calls }) => {
  const res = await send();
  assert.equal(res.status, 500);
  assert.equal((await errOf(res)).code, 'not_configured');
  const h = await (await get()).json();
  assert.equal(h.ok, false);
  assert.match(h.problem, /ALLOWED_ORIGIN/);
  assert.equal(calls.length, 0);
}));

test('refuses to run without OPENAI_API_KEY', () => worker({ vars: { OPENAI_API_KEY: undefined } }, async ({ send, calls }) => {
  const res = await send();
  assert.equal(res.status, 500);
  assert.match((await errOf(res)).message, /OPENAI_API_KEY/);
  assert.equal(calls.length, 0);
}));

test('refuses to spend with neither a ledger nor an access code', () => worker({ ledger: false }, async ({ send, calls }) => {
  const res = await send();
  assert.equal(res.status, 503);
  assert.equal((await errOf(res)).code, 'unprotected');
  assert.equal(calls.length, 0);
}));

test('an access code alone is enough protection to run', () => worker({ ledger: false, vars: { ACCESS_CODE: 'open-sesame' } }, async ({ send }) => {
  assert.equal((await send(BODY, { 'x-forge-access': 'open-sesame' })).status, 200);
}));

test('requires a matching Origin — and the refusal is readable cross-origin', () => worker({}, async ({ send, calls }) => {
  let res = await send(BODY, { origin: '' });
  assert.equal(res.status, 403);
  assert.equal((await errOf(res)).code, 'origin_required');
  res = await send(BODY, { origin: 'https://evil.example' });
  assert.equal(res.status, 403);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://evil.example');
  assert.match((await errOf(res)).message, /evil\.example is not in ALLOWED_ORIGIN/);
  assert.equal(calls.length, 0);
}));

test('preflight allows the headers the page sends', () => worker({}, async ({ options, calls }) => {
  const res = await options({ 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,x-forge-access' });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
  assert.match(res.headers.get('access-control-allow-headers'), /x-forge-access/);
  assert.match(res.headers.get('access-control-allow-methods'), /POST/);
  assert.equal(calls.length, 0);
}));

test('access code: missing and wrong are refused before anything is spent', () => worker({ vars: { ACCESS_CODE: 'open-sesame' } }, async ({ send, calls }) => {
  let res = await send();
  assert.equal(res.status, 401);
  assert.equal((await errOf(res)).code, 'access_code_required');
  res = await send(BODY, { 'x-forge-access': 'open-sesamE' });
  assert.equal(res.status, 401);
  assert.equal((await errOf(res)).code, 'access_code_wrong');
  assert.equal(calls.length, 0);
  assert.equal((await send(BODY, { 'x-forge-access': 'open-sesame' })).status, 200);
}));

test('validates the body', () => worker({}, async ({ send, calls }) => {
  const expect = async (body, status, re) => { const res = await send(body); assert.equal(res.status, status, JSON.stringify(body).slice(0, 80)); assert.match((await errOf(res)).message, re); };
  await expect('{not json', 400, /valid JSON/);
  await expect({ ...BODY, prompt: '' }, 400, /prompt/);
  await expect({ ...BODY, instructions: 42 }, 400, /instructions/);
  await expect({ ...BODY, tool: { ...TOOL, name: 'run_shell' } }, 400, /apply_patch/);
  await expect({ ...BODY, tool: { name: 'apply_patch' } }, 400, /input_schema/);
  await expect({ ...BODY, prompt: 'x'.repeat(4001) }, 413, /prompt/);
  await expect({ ...BODY, instructions: 'x'.repeat(24001) }, 413, /instructions/);
  await expect({ ...BODY, instructions: 'x'.repeat(70000) }, 413, /too large/);
  assert.equal(calls.length, 0);
}));

test('builds the upstream request itself; the key goes upstream and nowhere else', () => worker({}, async ({ send, calls }) => {
  const res = await send();
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  const [c] = calls;
  assert.equal(c.url, 'https://api.openai.com/v1/responses');
  assert.equal(c.auth, `Bearer ${KEY}`);
  assert.equal(c.body.model, 'gpt-5-mini');
  assert.equal(c.body.input, BODY.prompt);
  assert.equal(c.body.instructions, BODY.instructions);
  assert.equal(c.body.store, false);
  assert.equal(c.body.max_output_tokens, 8000);
  assert.deepEqual(c.body.tool_choice, { type: 'function', name: 'apply_patch' });
  assert.equal(c.body.tools.length, 1);
  assert.deepEqual(c.body.tools[0], { type: 'function', name: 'apply_patch', description: TOOL.description, parameters: TOOL.input_schema, strict: false });
  assert.equal('reasoning' in c.body, false, 'no reasoning param unless configured — valid efforts differ per model');
  const text = await res.text();
  assert.equal(text.includes(KEY), false);
}));

test('REASONING_EFFORT is passed through when set', () => worker({ vars: { REASONING_EFFORT: 'low' } }, async ({ send, calls }) => {
  await send();
  assert.deepEqual(calls[0].body.reasoning, { effort: 'low' });
}));

test('the reply is trimmed to the function call, with cost accounting', () => worker({}, async ({ send }) => {
  const d = await (await send()).json();
  assert.deepEqual(d.output.map(o => o.type), ['function_call']);
  assert.equal(d.output[0].name, 'apply_patch');
  assert.equal(JSON.parse(d.output[0].arguments).label, 'golden hour');
  assert.equal(d.model, 'gpt-5-mini-2025-08-07');
  assert.deepEqual(d.usage, { input_tokens: 1800, output_tokens: 600 });
  const cost = (1800 * 0.25 + 600 * 2) / 1e6;
  assert.equal(d.forge.costUsd, cost);
  assert.equal(d.forge.spentTodayUsd, cost);
  assert.equal(d.forge.budgetUsd, 1);
  assert.equal(d.forge.substituted, false);
}));

test('a model outside the allowlist is replaced by the default, and flagged', () => worker({}, async ({ send, calls }) => {
  const d = await (await send({ ...BODY, model: 'gpt-4o' })).json();
  assert.equal(calls[0].body.model, 'gpt-5-mini');
  assert.equal(d.forge.substituted, true);
}));

test('MODELS var replaces the table; a malformed one is ignored with a warning', () => worker({ vars: { MODELS: '{"gpt-6-luna":[0.1,0.5]}' } }, async ({ send, get, calls }) => {
  await send({ ...BODY, model: 'gpt-5-mini' });
  assert.equal(calls[0].body.model, 'gpt-6-luna');
  const h = await (await get()).json();
  assert.deepEqual(h.models, ['gpt-6-luna']);
}).then(() => worker({ vars: { MODELS: '{"gpt-x": "cheap"}' } }, async ({ get }) => {
  const h = await (await get()).json();
  assert.ok(h.models.includes('gpt-5-mini'));
  assert.match(h.warning, /MODELS/);
})));

test('daily budget: reserve-then-settle holds under concurrent calls', () => worker({
  vars: { DAILY_BUDGET_USD: '0.04' },
  upstream: async () => { await new Promise(r => setTimeout(r, 150)); return completed({ input_tokens: 3000, output_tokens: 8000 }); },
}, async ({ send, get, calls }) => {
  // each call holds ~$0.016 (8000 output tokens at $2/M) while in flight, so
  // only two of five simultaneous calls fit under $0.04
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => send()));
  const statuses = results.map(r => r.status).sort();
  assert.deepEqual(statuses, [200, 200, 429, 429, 429]);
  assert.equal(calls.length, 2, 'the cap held: only two calls went upstream');
  const refused = results.find(r => r.status === 429);
  assert.equal((await errOf(refused)).code, 'budget_exhausted');
  assert.ok(+refused.headers.get('retry-after') > 0);
  const h = await (await get()).json();
  assert.equal(h.protections.spentTodayUsd, 2 * (3000 * 0.25 + 8000 * 2) / 1e6);
  assert.equal((await send()).status, 429, 'and it stays shut for the day');
}));

test('rate limit is per address, and an IPv6 /64 counts as one address', () => worker({ vars: { RATE_LIMIT_PER_MINUTE: '3' } }, async ({ send }) => {
  for (let i = 0; i < 3; i++) assert.equal((await send()).status, 200);
  const res = await send();
  assert.equal(res.status, 429);
  assert.equal((await errOf(res)).code, 'rate_limited');
  assert.ok(+res.headers.get('retry-after') >= 1);
  assert.equal((await send(BODY, { 'cf-connecting-ip': '198.51.100.20' })).status, 200, 'another address is unaffected');
  const v6 = (ip) => send(BODY, { 'cf-connecting-ip': ip });
  for (const ip of ['2001:db8:1:2::1', '2001:db8:1:2:ffff::9', '2001:0db8:0001:0002:aaaa:bbbb:cccc:dddd']) assert.equal((await v6(ip)).status, 200);
  assert.equal((await v6('2001:db8:1:2::77')).status, 429, 'same /64');
  assert.equal((await v6('2001:db8:1:3::1')).status, 200, 'different /64');
}));

test('upstream errors map to clear messages and cost nothing', () => {
  const cases = [
    [401, 502, 'worker_key_rejected', /rejected this Worker's OPENAI_API_KEY/],
    [404, 502, 'model_unavailable', /no model "gpt-5-mini"/],
    [429, 429, 'upstream_error', /OpenAI 429/],
    [500, 502, 'upstream_error', /OpenAI 500/],
  ];
  return cases.reduce((p, [up, status, code, re]) => p.then(() => worker({ upstream: () => reply(up, { error: { message: `upstream said ${up}` } }) }, async ({ send, get }) => {
    const res = await send();
    assert.equal(res.status, status);
    const e = await errOf(res);
    assert.equal(e.code, code);
    assert.match(e.message, re);
    assert.match(e.message, new RegExp(`upstream said ${up}`));
    assert.equal((await (await get()).json()).protections.spentTodayUsd, 0);
  })), Promise.resolve());
});

test('if OpenAI is unreachable, the reservation is kept as spent', () => worker({ upstream: 'unreachable' }, async ({ send, get }) => {
  const res = await send();
  assert.equal(res.status, 502);
  assert.equal((await errOf(res)).code, 'upstream_unreachable');
  assert.ok((await (await get()).json()).protections.spentTodayUsd > 0.015);
}));

test('a reply without a patch is an error that explains the output cap — and is still charged', () => worker({
  upstream: () => reply(200, { id: 'r', model: 'gpt-5-mini', status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' },
    usage: { input_tokens: 2000, output_tokens: 8000 }, output: [{ type: 'reasoning', id: 'rs', summary: [] }] }),
}, async ({ send, get }) => {
  const res = await send();
  assert.equal(res.status, 502);
  const e = await errOf(res);
  assert.equal(e.code, 'no_patch');
  assert.match(e.message, /8000-token budget/);
  assert.equal((await (await get()).json()).protections.spentTodayUsd, (2000 * 0.25 + 8000 * 2) / 1e6);
}));

test('health never spends; the deep check is free, gated and rate-counted', () => worker({ vars: { ACCESS_CODE: 'open-sesame', RATE_LIMIT_PER_MINUTE: '2' },
  upstream: (c) => c.url.includes('/models/') ? reply(200, { id: 'gpt-5-mini', object: 'model' }) : completed() }, async ({ get, calls }) => {
  let h = await (await get()).json();
  assert.equal(calls.length, 0);
  assert.equal(h.ok, true);
  assert.equal(h.keyConfigured, true);
  assert.equal(h.defaultModel, 'gpt-5-mini');
  assert.deepEqual(h.protections.origins, [ORIGIN]);
  assert.equal(h.protections.originAllowed, true);
  assert.equal(h.protections.accessCode, 'required');
  assert.equal(h.protections.accessCodeAccepted, null);
  assert.equal(h.protections.dailyBudgetUsd, 1);
  assert.equal(h.protections.rateLimitPerMinute, 2);
  assert.match(h.protections.resetsAt, /T00:00:00\.000Z$/);
  assert.equal(JSON.stringify(h).includes(KEY), false);

  h = await (await get('/health?deep=1', { 'x-forge-access': 'nope' })).json();
  assert.equal(h.protections.accessCodeAccepted, false);
  assert.equal(h.upstream.checked, false);
  assert.equal(calls.length, 0);

  h = await (await get('/health?deep=1&model=gpt-6-luna', { 'x-forge-access': 'open-sesame' })).json();
  assert.equal(h.protections.accessCodeAccepted, true);
  assert.deepEqual([calls.length, calls[0].method, calls[0].url, calls[0].auth], [1, 'GET', 'https://api.openai.com/v1/models/gpt-6-luna', `Bearer ${KEY}`]);
  assert.equal(h.upstream.ok, true);

  await get('/health?deep=1', { 'x-forge-access': 'open-sesame' });
  h = await (await get('/health?deep=1', { 'x-forge-access': 'open-sesame' })).json();
  assert.equal(h.upstream.checked, false, 'third deep check in a minute is rate-limited');
  assert.equal(calls.length, 2);
}));

test('deep check reports a key OpenAI rejects, in plain words', () => worker({ upstream: () => reply(401, { error: { message: 'Incorrect API key provided' } }) }, async ({ get }) => {
  const h = await (await get('/health?deep=1')).json();
  assert.equal(h.upstream.ok, false);
  assert.match(h.upstream.message, /rejected the Worker's key: Incorrect API key/);
}));
