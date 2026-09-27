// Forge end-to-end check — drives examples/tessera-forge.html in headless
// Chromium against the REAL Worker (workers/tessera-forge-openai.js, running
// in workerd via Miniflare on a local port, with OpenAI scripted), and against
// intercepted api.anthropic.com / api.openai.com for the key-in-browser
// providers. Asserts what the page sends, what it shows, and what it stores.
//
//   cd tools && npm install && (cd ../workers && npm install) && node forge-check.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const TMOD = path.resolve(path.dirname(createRequire(import.meta.url).resolve('three')), '..');
const { Miniflare, Response } = createRequire(path.join(ROOT, 'workers/package.json'))('miniflare');
const EXE = process.env.CHROMIUM_PATH ||
  (fs.readdirSync('/opt/pw-browsers').filter(d => d.startsWith('chromium-')).map(d => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find(fs.existsSync));

// ── the page, served locally ──────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html' : 'text/javascript' }); res.end(data);
  });
});
await new Promise(r => server.listen(0, r));
const PAGE_ORIGIN = `http://localhost:${server.address().port}`;

// ── the Worker, in workerd, with OpenAI scripted ─────────────────────────
const upstream = [];
const json = (status, v) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
async function startWorker(vars = {}) {
  const mf = new Miniflare({
    modules: true, modulesRoot: path.join(ROOT, 'workers'), scriptPath: path.join(ROOT, 'workers/tessera-forge-openai.js'), compatibilityDate: '2026-07-01', port: 0,
    bindings: { ALLOWED_ORIGIN: PAGE_ORIGIN, OPENAI_API_KEY: 'sk-worker-SECRET', DAILY_BUDGET_USD: '1.00', RATE_LIMIT_PER_MINUTE: '8', ...vars },
    durableObjects: { LEDGER: { className: 'Ledger', useSQLite: true } },
    outboundService: async (req) => {
      const body = req.method === 'POST' ? JSON.parse(await req.text()) : null;
      upstream.push({ url: req.url, method: req.method, auth: req.headers.get('authorization'), body });
      if (req.url.includes('/v1/models/')) return json(200, { id: req.url.split('/').pop(), object: 'model' });
      return json(200, { id: 'resp_1', model: 'gpt-5-mini-2025-08-07', status: 'completed', usage: { input_tokens: 2100, output_tokens: 700 },
        output: [{ type: 'reasoning', id: 'rs' }, { type: 'function_call', call_id: 'c1', name: 'apply_patch',
          arguments: JSON.stringify({ label: 'fog bank', note: 'thicker fog', ops: [{ op: 'set', key: 'env.fog', value: 0.12 }, { op: 'set', key: 'post.bloom', value: 1.1 }] }) }] });
    },
  });
  return { mf, url: (await mf.ready).toString().replace(/\/$/, '') };
}

// ── browser ──────────────────────────────────────────────────────────────
const browser = await chromium.launch({ executablePath: EXE, headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 860 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
await page.route('**unpkg.com/**', (route) => {
  const rel = new URL(route.request().url()).pathname.replace(/^\/three@[^/]+\//, '');
  try { route.fulfill({ body: fs.readFileSync(path.join(TMOD, rel)), headers: { 'Content-Type': 'text/javascript' } }); } catch { route.abort(); }
});
// the key-in-browser providers: scripted per test
const direct = [];
let anthropicReply = null, openaiReply = null;
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'content-type': 'application/json' };
await page.route('https://api.anthropic.com/**', async (route) => {
  const r = route.request();
  if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  direct.push({ url: r.url(), method: r.method(), headers: r.headers(), body: r.postData() ? JSON.parse(r.postData()) : null });
  const [status, body] = anthropicReply(r);
  route.fulfill({ status, headers: cors, body: typeof body === 'string' ? body : JSON.stringify(body) });
});
await page.route('https://api.openai.com/**', async (route) => {
  const r = route.request();
  if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  direct.push({ url: r.url(), method: r.method(), headers: r.headers(), body: r.postData() ? JSON.parse(r.postData()) : null });
  const [status, body] = openaiReply(r);
  route.fulfill({ status, headers: cors, body: typeof body === 'string' ? body : JSON.stringify(body) });
});

await page.goto(`${PAGE_ORIGIN}/examples/tessera-forge.html`);
await page.waitForFunction(() => window.forge && document.querySelector('#status').textContent.includes('fps'), null, { timeout: 60000 });

const $t = (sel) => page.$eval(sel, el => el.textContent);
const conn = () => $t('#conn');
const lastLog = () => page.$eval('#pPatch .entry', el => el.innerText);
const P = (k) => page.evaluate((k) => window.forge.params[k], k);
async function waitConn(re) { await page.waitForFunction((src) => new RegExp(src).test(document.querySelector('#conn').textContent), re.source, { timeout: 20000 }); return conn(); }
async function go(text) {
  const before = await page.evaluate(() => document.querySelectorAll('#pPatch .entry').length);
  await page.fill('#prompt', text); await page.click('#send');
  await page.waitForFunction((n) => { const e = document.querySelectorAll('#pPatch .entry'); return e.length > n && !e[0].innerText.includes('thinking…'); }, before, { timeout: 20000 });
  return lastLog();
}
const results = [];
async function check(name, fn) {
  try { await fn(); results.push(['ok', name]); console.log('  ok  ', name); }
  catch (e) { results.push(['FAIL', name]); console.log('  FAIL', name, '\n       ', String(e.message).split('\n').slice(0, 6).join('\n        ')); }
}

await page.click('#mClaude');

// ── Worker provider ──────────────────────────────────────────────────────
let W = await startWorker();
await check('Worker: URL is saved on input, before any blur', async () => {
  await page.selectOption('#provider', 'proxy');
  assert.match(await conn(), /no Worker URL yet/);
  await page.fill('#endpoint', W.url);
  assert.equal(await page.evaluate(() => localStorage.getItem('forge.endpoint.proxy')), W.url);
  assert.match(await conn(), /saved · not tested/);
  assert.equal(await page.isVisible('#key'), false, 'no key field in Worker mode');
  assert.equal(await page.isVisible('#access'), true);
});
await check('Worker: test proves Worker, key and model without spending', async () => {
  upstream.length = 0;
  await page.click('#testBtn');
  assert.match(await waitConn(/✓|wrong|not|unreach|allowed|needs/), /Worker ✓ · key ✓ · gpt-5-mini ✓/);
  assert.match(await lastLog(), /accepts http:\/\/localhost:\d+ · no access code · \$0\.0000 of \$1\.00 spent today · 8\/min per address/);
  assert.deepEqual(upstream.map(u => `${u.method} ${u.url}`), ['GET https://api.openai.com/v1/models/gpt-5-mini']);
  const opts = await page.$$eval('#model option', os => os.map(o => o.value));
  assert.deepEqual(opts, ['gpt-5-mini', 'gpt-5', 'gpt-5-nano', 'gpt-6-luna', 'gpt-6-sol'], 'model list comes from the Worker');
});
await check('Worker: a prompt round-trips into applied ops, with the Worker\'s own cost and day total', async () => {
  upstream.length = 0;
  const log = await go('bring in a fog bank');
  assert.equal(await P('env.fog'), 0.12);
  assert.equal(await P('post.bloom'), 1.1);
  assert.match(log, /fog bank/);
  const cost = (2100 * 0.25 + 700 * 2) / 1e6;
  assert.match(log, new RegExp(`~\\$${cost.toFixed(4).replace('.', '\\.')} · Worker today \\$${cost.toFixed(4).replace('.', '\\.')} of \\$1\\.00`));
  const [u] = upstream;
  assert.equal(u.auth, 'Bearer sk-worker-SECRET', 'only the Worker adds a key');
  assert.equal(u.body.store, false);
  assert.equal(u.body.tool_choice.name, 'apply_patch');
  assert.equal(await page.evaluate(() => Object.values(localStorage).some(v => /^sk-/.test(v))), false, 'no key in this browser');
});
await check('Worker: access code — asked for, refused when wrong, accepted when right', async () => {
  await W.mf.dispose(); W = await startWorker({ ACCESS_CODE: 'tessellate' });
  await page.fill('#endpoint', W.url);
  await page.click('#testBtn');
  assert.match(await waitConn(/✓|wrong|needs|unreach/), /needs access code/);
  await page.fill('#access', 'tesselate');
  await page.click('#testBtn');
  assert.match(await waitConn(/✓|wrong|needs|unreach/), /access code wrong/);
  await page.fill('#access', 'tessellate');
  await page.click('#testBtn');
  assert.match(await waitConn(/✓|wrong|needs|unreach/), /Worker ✓/);
  await go('reset');
  assert.match(await lastLog(), /fog bank|reset/);
});
await check('Worker: a page on the wrong origin gets a readable reason, not "Failed to fetch"', async () => {
  await W.mf.dispose(); W = await startWorker({ ALLOWED_ORIGIN: 'https://barnickelus.github.io' });
  await page.fill('#access', '');
  await page.fill('#endpoint', W.url);
  await page.click('#testBtn');
  assert.match(await waitConn(/✓|allowed|unreach|not/), /origin not allowed/);
  assert.match(await lastLog(), /This page is at http:\/\/localhost:\d+, which the Worker's ALLOWED_ORIGIN doesn't include/);
  assert.match(await go('more fog'), /403 — Origin http:\/\/localhost:\d+ is not in ALLOWED_ORIGIN/);
});
await check('Worker: the daily cap stops spending and says when it resets', async () => {
  await W.mf.dispose(); W = await startWorker({ DAILY_BUDGET_USD: '0.001' });
  await page.fill('#endpoint', W.url);
  assert.match(await go('more fog'), /429 — Today's budget for this Worker is used up .* resets at 00:00 UTC/);
});
await check('Worker: an unreachable URL is reported as such', async () => {
  await page.fill('#endpoint', 'http://127.0.0.1:9');
  await page.click('#testBtn');
  assert.match(await waitConn(/✓|unreach|not/), /unreachable/);
  assert.match(await lastLog(), /Check the Worker URL/);
});
await W.mf.dispose();

// ── Anthropic, key in browser ────────────────────────────────────────────
await check('Anthropic: key saved on input; test hits the free models endpoint with browser-access headers', async () => {
  await page.selectOption('#provider', 'anthropic');
  await page.fill('#key', 'sk-ant-api03-test');
  assert.equal(await page.evaluate(() => localStorage.getItem('forge.key.anthropic')), 'sk-ant-api03-test');
  direct.length = 0;
  anthropicReply = () => [200, { id: 'claude-opus-5', display_name: 'Claude Opus 5', type: 'model' }];
  await page.click('#testBtn');
  assert.match(await waitConn(/key|error|unreach/), /key works · Claude Opus 5/);
  const [r] = direct;
  assert.equal(`${r.method} ${r.url}`, 'GET https://api.anthropic.com/v1/models/claude-opus-5');
  assert.equal(r.headers['x-api-key'], 'sk-ant-api03-test');
  assert.equal(r.headers['anthropic-dangerous-direct-browser-access'], 'true');
});
const toolUse = (model, usage = { input_tokens: 1633, output_tokens: 880 }) => () => [200, { id: 'm', type: 'message', role: 'assistant', model, stop_reason: 'tool_use', usage,
  content: [{ type: 'tool_use', id: 't', name: 'apply_patch', input: { label: 'neon', ops: [{ op: 'set', key: 'post.chroma', value: 1.4 }] } }] }];
await check('Anthropic: Opus 5 sends adaptive thinking and opts into server-side refusal fallbacks', async () => {
  direct.length = 0; anthropicReply = toolUse('claude-opus-5');
  const log = await go('make it neon');
  const [r] = direct;
  assert.deepEqual(r.body.thinking, { type: 'adaptive' });
  assert.equal(r.body.fallbacks, 'default');
  assert.equal(r.headers['anthropic-beta'], 'server-side-fallback-2026-07-01');
  assert.equal(await P('post.chroma'), 1.4);
  assert.match(log, /~\$0\.0302/, 'Opus 5 at $5/$25: 1633 in / 880 out');
});
await check('Anthropic: Sonnet 5 is priced at $2/$10 (was $3/$15)', async () => {
  await page.selectOption('#model', 'claude-sonnet-5');
  direct.length = 0; anthropicReply = toolUse('claude-sonnet-5');
  const log = await go('make it neon');
  assert.equal('fallbacks' in direct[0].body, false);
  assert.equal(direct[0].headers['anthropic-beta'], undefined);
  assert.match(log, /~\$0\.0121/, '(1633*2 + 880*10)/1e6 = 0.012066');
});
await check('Anthropic: Haiku 4.5 is sent no adaptive thinking (it predates it)', async () => {
  await page.selectOption('#model', 'claude-haiku-4-5');
  direct.length = 0; anthropicReply = toolUse('claude-haiku-4-5');
  await go('make it neon');
  assert.equal('thinking' in direct[0].body, false);
});
await check('Anthropic: a refusal is named as one', async () => {
  await page.selectOption('#model', 'claude-opus-5');
  anthropicReply = () => [200, { id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5', stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber' }, content: [], usage: { input_tokens: 10, output_tokens: 0 } }];
  assert.match(await go('make it neon'), /Claude declined this request \(cyber\)/);
});
await check('Anthropic: a non-JSON error body is shown, not swallowed', async () => {
  anthropicReply = () => [502, '<html>Bad gateway</html>'];
  assert.match(await go('make it neon'), /502 — <html>Bad gateway<\/html>/);
});
await check('Anthropic: a wrong key is caught by test', async () => {
  anthropicReply = () => [401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }];
  await page.click('#testBtn');
  assert.match(await waitConn(/key|error|unreach/), /key rejected/);
  assert.match(await lastLog(), /Anthropic rejected that key: 401 — invalid x-api-key/);
});

// ── OpenAI, key in browser ───────────────────────────────────────────────
await check('OpenAI: test reports a model the key cannot use', async () => {
  await page.selectOption('#provider', 'openai');
  await page.fill('#key', 'sk-proj-test');
  await page.fill('#modelText', 'gpt-9-imaginary');
  openaiReply = () => [404, { error: { message: "The model 'gpt-9-imaginary' does not exist", type: 'invalid_request_error' } }];
  await page.click('#testBtn');
  assert.match(await waitConn(/key|error|unreach/), /key can't use gpt-9-imaginary/);
});
await check('OpenAI: a dated snapshot in the reply still gets priced', async () => {
  await page.fill('#modelText', 'gpt-5-mini');
  openaiReply = () => [200, { id: 'r', model: 'gpt-5-mini-2025-08-07', status: 'completed', usage: { input_tokens: 2000, output_tokens: 1000 },
    output: [{ type: 'function_call', call_id: 'c', name: 'apply_patch', arguments: JSON.stringify({ label: 'dusk', ops: [{ op: 'set', key: 'env.exposure', value: 0.8 }] }) }] }];
  const log = await go('dusk');
  assert.equal(await P('env.exposure'), 0.8);
  assert.match(log, /~\$0\.0025/, '(2000*0.25 + 1000*2)/1e6');
});
await check('Pasting an Anthropic key into OpenAI mode, or a non-sk key anywhere, throws nothing', async () => {
  const n = pageErrors.length;
  await page.fill('#key', 'sk-ant-api03-xyz'); await page.press('#key', 'Tab');
  await page.selectOption('#provider', 'anthropic');
  await page.fill('#key', 'not-a-key'); await page.press('#key', 'Tab');
  assert.equal(pageErrors.length, n, pageErrors.slice(n).join('\n'));
});
await check('Recipes still work offline', async () => {
  await page.click('#mRecipe');
  const log = await go('golden hour');
  assert.match(log, /golden hour/);
  assert.equal(await P('light.key.color'), '#ffb347');
});

console.log(`\n${results.filter(r => r[0] === 'ok').length}/${results.length} passed · page errors: ${pageErrors.length}${pageErrors.length ? '\n  ' + pageErrors.join('\n  ') : ''}`);
await browser.close(); server.close();
process.exit(results.every(r => r[0] === 'ok') && !pageErrors.length ? 0 : 1);
