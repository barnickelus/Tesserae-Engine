// Visual-critic harness — render a prototype headlessly and screenshot it, so
// changes can be reviewed without a device. Serves the repo over a local server,
// loads the page in Chromium with software WebGL, intercepts the three.js CDN
// imports and serves them from the local `three` install (fully offline), waits
// for the tessera build, optionally clicks control buttons, and writes a PNG.
//
//   cd tools && npm install            # playwright + three (browsers preinstalled)
//   node render.mjs <example-path> <out.png> [waitMs] [W] [H] [clicks]
//   e.g. node render.mjs examples/tessera-preview.html out.png 7000 1100 900 "50%,reframe"
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.TESSERAE_ROOT || path.resolve(here, '..');
// three's package root (resolve its main module, then up out of build/)
const TMOD = path.resolve(path.dirname(createRequire(import.meta.url).resolve('three')), '..');
const EXE = process.env.CHROMIUM_PATH ||
  (fs.readdirSync('/opt/pw-browsers').filter(d => d.startsWith('chromium-')).map(d => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find(fs.existsSync));

const [, , examplePath = 'examples/tessera-preview.html', out = 'shot.png', waitMs = '8000', W = '1100', H = '900', clicks = ''] = process.argv;

const MIME = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.glb':'model/gltf-binary', '.png':'image/png', '.json':'application/json', '.css':'text/css' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: EXE, headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-networking'],
});
const ctx = await browser.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
// serve three.js + addons from the local npm copy instead of the unpkg CDN
await page.route('**unpkg.com/**', (route) => {
  const rel = new URL(route.request().url()).pathname.replace(/^\/three@[^/]+\//, '');
  try { route.fulfill({ body: fs.readFileSync(path.join(TMOD, rel)), headers: { 'Content-Type': 'text/javascript' } }); }
  catch { route.abort(); }
});
page.on('console', m => console.log('  [page]', m.type(), m.text().slice(0, 200)));
page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 300)));

const url = `http://localhost:${port}/${examplePath}`;
console.log('loading', url);
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
try { await page.waitForFunction(() => { const el = document.querySelector('#count'); return el && el.textContent && el.textContent !== '—'; }, { timeout: 45000 }); }
catch { console.log('  (count never populated — render may have failed)'); }
// optional control clicks (button labels), then stop auto-spin for a stable view
for (const label of clicks.split(',').map(s => s.trim()).filter(Boolean)) {
  await page.evaluate((t) => { const b = [...document.querySelectorAll('button')].find(x => x.textContent === t); if (b) b.click(); }, label).catch(()=>{});
  await page.waitForTimeout(1500);
}
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent === 'auto-spin'); if (b && b.classList.contains('active')) b.click(); }).catch(()=>{});
await page.waitForTimeout(+waitMs);
console.log('model:', await page.evaluate(() => document.querySelector('#model')?.textContent || ''),
            '| tesserae:', await page.evaluate(() => document.querySelector('#count')?.textContent || ''));
await page.screenshot({ path: path.isAbsolute(out) ? out : path.join(ROOT, out) });
console.log('wrote', out);
await browser.close(); server.close();
