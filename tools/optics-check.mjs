// Optics check — the tessera "seen by the eye", measured.
//
//   node optics-check.mjs <Model> ["variant|variant|…"] [--ppd 30,60,120,240]
//                        [--yaw deg] [--zoom f] [--lift h] [--pose Clip@t]
//                        [--shots dir] [--size WxH]
//
//   --zoom f   move the camera f× closer to what it looks at (2 = half the distance)
//   --lift h   raise the look-at point by h × the half-height of the view
//              (0.5 ≈ from the page's default framing to the upper body)
//   A variant item written as js:<code> runs <code> in the page instead of
//   clicking, with window.mosaic in scope as M — for experiments, e.g.
//     "room,flat|room,flat,js:M.renderer.toneMapping = 0"
//
//   A variant is a comma list of the page's button labels to click first, e.g.
//     node optics-check.mjs Portrait "pure,thin|flat,thin" --yaw 180
//
// For each variant it renders, from the same camera, frozen pose and lights:
//   · the ORIGINAL mesh, with its own materials — what the object looks like;
//   · the TESSERA version — what the mosaic says it looks like.
// Then it models human vision with S-CIELAB (Zhang & Wandell): convert both to
// an opponent colour space (luminance, red–green, blue–yellow), blur each
// channel by the eye's contrast sensitivity at a viewing distance given in
// pixels per degree of visual angle, and compare in CIELAB.
//
// More pixels per degree = the viewer is further away. At 30 ppd a 900-px-wide
// canvas fills 30° of view (a laptop at arm's length); 240 ppd is eight times
// further. The eye blurs chroma far more than luminance at every distance
// (Zhang, Silverstein, Farrell & Wandell 1997: plain CIELAB "over-estimates
// the texture visibility of halftone patterns composed of red-green dots or
// blue-yellow dots … visual sensitivity to chromatic contrast is much lower
// than sensitivity to luminance contrast") — which is exactly what lets a
// divisionist tile fuse while a luminance texture on it would still show.
//
// Reported per variant and distance, over the object's pixels:
//   ΔE      mean S-CIELAB colour difference (ΔE*ab after the eye's filters);
//           ~1 is a just-noticeable difference, ~2–3 small, >10 obvious
//   ΔL*     signed lightness bias, tessera − original: negative = darker
//   ΔC      chroma-only difference (a*, b*), i.e. hue/saturation error
//   ΔC*     signed saturation bias, C*ab(tessera) − C*ab(original): negative =
//           the tesserae read greyer than the object
//   form    SSIM of the eye-filtered lightness maps — how well the pattern of
//           light and shade (the cue the eye uses for 3D form) survives
//
// Filter parameters: S-CIELAB's published sum-of-Gaussians kernels, each
// Gaussian k·exp(−(x²+y²)/s²) with s in degrees; opponent transform from
// Poirson & Wandell as used by S-CIELAB. The absolute numbers are a model;
// the check is for comparing variants of the tile on the same scene.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.TESSERAE_ROOT || path.resolve(here, '..');
const TMOD = path.resolve(path.dirname(createRequire(import.meta.url).resolve('three')), '..');
const CACHE = path.join(here, '.glb-cache');
const EXE = process.env.CHROMIUM_PATH ||
  (fs.readdirSync('/opt/pw-browsers').filter(d => d.startsWith('chromium-')).map(d => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find(fs.existsSync));

// ── args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const model = argv[0] || 'Portrait';
const variants = (argv[1] && !argv[1].startsWith('--') ? argv[1] : 'pure,thin').split('|').map(v => v.split(',').map(s => s.trim()).filter(Boolean));
const PPD = opt('ppd', '30,60,120,240').split(',').map(Number);
const YAW = +opt('yaw', '0'), ZOOM = +opt('zoom', '1'), LIFT = +opt('lift', '0');
const POSE = opt('pose', '');
const SHOTS = opt('shots', '');
const [VW, VH] = opt('size', '900x800').split('x').map(Number);
const PAGE = process.env.PAGE || 'examples/tessera-mosaic.html';

import { toOpponent, eyeLab, ssim, png } from './lib/scielab.mjs';

// ── the page ───────────────────────────────────────────────────────────────
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(file, (err, data) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }); res.end(data); });
});
await new Promise(r => server.listen(0, r));
const browser = await chromium.launch({ executablePath: EXE, headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 })).newPage();
await page.route('**unpkg.com/**', (route) => {
  const rel = new URL(route.request().url()).pathname.replace(/^\/three@[^/]+\//, '');
  try { route.fulfill({ body: fs.readFileSync(path.join(TMOD, rel)), headers: { 'Content-Type': 'text/javascript' } }); } catch { route.abort(); }
});
fs.mkdirSync(CACHE, { recursive: true });
await page.route('**/*.glb', (route) => {
  const url = route.request().url();
  if (url.includes('localhost')) return route.continue();
  const f = path.join(CACHE, url.replace(/[^a-zA-Z0-9.]+/g, '_'));
  try { if (!fs.existsSync(f)) execFileSync('curl', ['-sSfL', '--max-time', '180', '-o', f, url]); route.fulfill({ body: fs.readFileSync(f), headers: { 'Content-Type': 'model/gltf-binary' } }); }
  catch (e) { route.abort(); }
});
// Math.random is seeded too, so even a page that doesn't seed its own
// build (e.g. an older version, measured for comparison) repeats exactly
await page.addInitScript(() => { let a = 0x7e55e7a; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; });
let pageErrors = 0;
page.on('pageerror', e => { pageErrors++; console.log('  [pageerror]', String(e).slice(0, 300)); });

await page.goto(`http://localhost:${server.address().port}/${PAGE}`, { waitUntil: 'load', timeout: 60000 });
const waitModel = (m) => page.waitForFunction((m) => { const t = document.querySelector('#model')?.textContent || ''; return t.startsWith(m + ' ·') || t.includes('failed'); }, m, { timeout: 240000 });
await page.waitForFunction(() => /covered|failed/.test(document.querySelector('#model')?.textContent || ''), null, { timeout: 180000 });
const click = (t) => page.evaluate((t) => { const b = [...document.querySelectorAll('button')].find(x => x.textContent === t); if (b) { b.click(); return true; } return false; }, t);
if (!(await page.evaluate(() => document.querySelector('#model').textContent)).startsWith(model + ' ·')) { await click(model); await waitModel(model); }
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent === 'auto-spin'); if (b?.classList.contains('active')) b.click(); });
await page.evaluate(() => { for (const el of document.body.children) if (el.id !== 'app' && el.tagName !== 'SCRIPT') el.style.visibility = 'hidden'; });

async function settle(label) {
  // pose: skinned rigs at a fixed clip time, static busts at rest
  await page.evaluate(({ pose }) => {
    const M = window.mosaic;
    if (M.mixer && pose) {
      const [clip, t] = pose.split('@'), ci = M.clips.findIndex(c => c.name === clip);
      M.mixer.stopAllAction(); M.mixer.timeScale = 1;
      const a = M.mixer.clipAction(M.clips[Math.max(0, ci)]); a.reset(); a.setEffectiveWeight(1); a.play();
      M.mixer.setTime(+t || 0); M.mixer.timeScale = 0; M.updateSkin(0);
    } else M.freeze(true);
  }, { pose: POSE });
  await page.waitForTimeout(400);
}
await page.evaluate(({ yaw, zoom, lift }) => {
  const { camera, controls, THREE } = window.mosaic;
  const off = camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw * Math.PI / 180);
  const halfH = off.length() * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  controls.target.y += lift * halfH;
  camera.position.copy(controls.target).add(off.multiplyScalar(1 / zoom)); controls.update();
}, { yaw: YAW, zoom: ZOOM, lift: LIFT });

async function capture() {
  const r = await page.evaluate(() => {
    const M = window.mosaic, R = M.renderer, gl = R.getContext(), tiles = [], orig = [];
    M.scene.traverse(o => { if (o.isInstancedMesh || o.userData.tesseraBed) tiles.push(o); });
    M.root.traverse(o => { if (o.isMesh && !o.userData.tesseraBed) orig.push(o); });   // a skinned rig's bed lives inside the rig
    const read = () => { R.render(M.scene, M.camera); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w*h*4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); return { w, h, px }; };
    const vis = tiles.map(t => t.visible);
    tiles.forEach(t => t.visible = false); orig.forEach(o => o.visible = true);
    const ref = read();
    tiles.forEach((t, i) => t.visible = vis[i]); orig.forEach(o => o.visible = false);
    const tes = read();
    const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
    return { w: ref.w, h: ref.h, ref: b64(ref.px), tes: b64(tes.px) };
  });
  return { w: r.w, h: r.h, ref: Buffer.from(r.ref, 'base64'), tes: Buffer.from(r.tes, 'base64') };
}

function analyse(cap) {
  const { w, h, ref, tes } = cap;
  // object mask: anything that isn't the background in either image, grown by 2 px
  const bg = [ref[0], ref[1], ref[2]], raw = new Uint8Array(w*h), mask = new Uint8Array(w*h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = ((h - 1 - y)*w + x)*4; let d = 0;
    for (const img of [ref, tes]) d = Math.max(d, Math.abs(img[s] - bg[0]) + Math.abs(img[s+1] - bg[1]) + Math.abs(img[s+2] - bg[2]));
    raw[y*w + x] = d > 12 ? 1 : 0;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0; for (let dy = -2; dy <= 2 && !m; dy++) for (let dx = -2; dx <= 2 && !m; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < h && xx >= 0 && xx < w && raw[yy*w + xx]) m = 1; }
    mask[y*w + x] = m;
  }
  const Oref = toOpponent(ref, w, h), Otes = toOpponent(tes, w, h), rows = [];
  let maps = null;
  for (const ppd of PPD) {
    const a = eyeLab(Oref, w, h, ppd), b = eyeLab(Otes, w, h, ppd);
    let dE = 0, dL = 0, dC = 0, dCs = 0, n = 0;
    const map = new Float32Array(w*h);
    for (let i = 0; i < w*h; i++) if (mask[i]) {
      const l = b.L[i] - a.L[i], aa = b.A[i] - a.A[i], bb = b.B[i] - a.B[i], e = Math.hypot(l, aa, bb);
      dE += e; dL += l; dC += Math.hypot(aa, bb); dCs += Math.hypot(b.A[i], b.B[i]) - Math.hypot(a.A[i], a.B[i]); n++; map[i] = e;
    }
    rows.push({ ppd, dE: dE/n, dL: dL/n, dC: dC/n, dCs: dCs/n, form: ssim(a.L, b.L, w, h, mask) });
    if (ppd === PPD[Math.floor(PPD.length / 2)]) maps = { ppd, map };
  }
  return { rows, maps, pixels: mask.reduce((s, v) => s + v, 0) };
}

function composite(cap, maps, file) {
  const { w, h, ref, tes } = cap, out = new Uint8Array(w*3*h*3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = ((h - 1 - y)*w + x)*4, o = (y*w*3 + x)*3;
    for (let c = 0; c < 3; c++) { out[o + c] = ref[s + c]; out[o + w*3 + c] = tes[s + c]; }
    const e = Math.min(1, maps.map[y*w + x] / 20);   // 0 → black … 20 ΔE → white-hot
    out[o + 2*w*3] = 255*Math.min(1, e*2.2); out[o + 2*w*3 + 1] = 255*Math.max(0, Math.min(1, e*2.2 - 0.6)); out[o + 2*w*3 + 2] = 255*Math.max(0, e*3 - 2);
  }
  fs.writeFileSync(file, png(w*3, h, out));
}

const report = [];
for (const v of variants) {
  for (const label of v) {
    if (label.startsWith('js:')) { await page.evaluate((code) => { const M = window.mosaic; eval(code); }, label.slice(3)); continue; }
    if (!(await click(label))) console.log(`  (no button "${label}")`);
  }
  await page.waitForTimeout(600);
  await settle();
  const cap = await capture();
  const res = analyse(cap);
  const name = v.join(',') || '(default)';
  console.log(`\n  ${model} · ${name}`);
  console.table(Object.fromEntries(res.rows.map(r => [`${r.ppd} ppd`, { 'ΔE': +r.dE.toFixed(2), 'ΔL*': +r.dL.toFixed(2), 'ΔC': +r.dC.toFixed(2), 'ΔC*': +r.dCs.toFixed(2), form: +r.form.toFixed(3) }])));
  report.push({ variant: name, ...res, maps: undefined });
  if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); composite(cap, res.maps, path.join(SHOTS, `${model}-${name.replace(/[^a-z0-9]+/gi, '_')}.png`.toLowerCase())); }
}
if (process.env.JSON_OUT) fs.writeFileSync(process.env.JSON_OUT, JSON.stringify({ model, ppd: PPD, report }, null, 1));
console.log(`\npage errors: ${pageErrors}`);
await browser.close(); server.close();
