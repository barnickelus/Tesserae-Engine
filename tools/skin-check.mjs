// Skinning check — measure tessera-mosaic's CPU-skinned tiles against
// three.js's OWN skinning of the same mesh, per source mesh, at fixed clip
// times, and screenshot the pose next to the plain mesh.
//
//   node skin-check.mjs <Model> [clip@t,clip@t,...] [shot-dir]
//   e.g. node skin-check.mjs Soldier "TPose@0,Idle@0.6,Run@0.35" ../shots
//
// Why this exists: every roadmap entry on skeletal skinning ended with "could
// not verify against the real Soldier/Fox/Human assets from this sandbox" —
// judged by eye on synthetic 2-bone rigs instead. This measures it.
//
// The oracle is independent of the page's own bookkeeping:
//   · a tile's own piece of surface is the triangle nearest its bind-pose
//     position (not anything the page stored about it);
//   · where that triangle actually is in the pose comes from
//     SkinnedMesh.applyBoneTransform — three's CPU mirror of the GPU skinning
//     shader, run on each mesh with that mesh's own skeleton.
// Tiles are measured against their OWN triangle, posed (correspondence), not
// whatever surface is nearest in the pose — that would be fooled wherever skin
// meets skin, e.g. an arm lowered against the torso. Reported per source mesh:
//   off-surface%  how much further the tile sits from its own surface than it
//                 did at bind, as % of the model's rendered height;
//   normal°       angle between the tile's normal (+Z) and that surface's;
//   facing away   tiles with normal° > 90;
//   drift°        change in normal° since bind pose — pure skinning error, since
//                 the octree's averaging error is already present at bind.
// A correct skin keeps a posed clip at its bind-pose numbers.
//
// Needs network for the CDN rigs. Chromium may not trust a TLS-intercepting
// proxy's CA, so external .glb files are fetched with curl (which reads the
// system CA config) into tools/.glb-cache and served to the page from there.
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

const [, , model = 'Soldier', posesArg = 'TPose@0,Idle@0.6', shotDir = ''] = process.argv;
const PAGE = process.env.PAGE || 'examples/tessera-mosaic.html';

const MIME = { '.html':'text/html', '.js':'text/javascript', '.glb':'model/gltf-binary', '.png':'image/png' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }); res.end(data);
  });
});
await new Promise(r => server.listen(0, r));

const browser = await chromium.launch({ executablePath: EXE, headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 900, height: 800 }, deviceScaleFactor: 1 })).newPage();
await page.route('**unpkg.com/**', (route) => {
  const rel = new URL(route.request().url()).pathname.replace(/^\/three@[^/]+\//, '');
  try { route.fulfill({ body: fs.readFileSync(path.join(TMOD, rel)), headers: { 'Content-Type': 'text/javascript' } }); }
  catch { route.abort(); }
});
fs.mkdirSync(CACHE, { recursive: true });
await page.route('**/*.glb', (route) => {
  const url = route.request().url();
  if (url.includes('localhost')) return route.continue();
  const f = path.join(CACHE, url.replace(/[^a-zA-Z0-9.]+/g, '_'));
  try {
    if (!fs.existsSync(f)) execFileSync('curl', ['-sSfL', '--max-time', '180', '-o', f, url]);
    route.fulfill({ body: fs.readFileSync(f), headers: { 'Content-Type': 'model/gltf-binary' } });
  } catch (e) { console.log('  could not fetch', url, '—', String(e.message).slice(0, 120)); route.abort(); }
});
let pageErrors = 0;
page.on('pageerror', e => { pageErrors++; console.log('  [pageerror]', String(e).slice(0, 300)); });

await page.goto(`http://localhost:${server.address().port}/${PAGE}`, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => /covered|failed/.test(document.querySelector('#model')?.textContent || ''), null, { timeout: 180000 });
await page.evaluate((m) => [...document.querySelectorAll('button')].find(b => b.textContent === m)?.click(), model);
await page.waitForFunction((m) => { const t = document.querySelector('#model')?.textContent || ''; return t.startsWith(m + ' ·') || t.includes('failed'); }, model, { timeout: 240000 });
const label = await page.evaluate(() => document.querySelector('#model').textContent);
console.log(`${label} · ${await page.evaluate(() => document.querySelector('#count').textContent)} tiles`);
if (label.includes('failed')) process.exit(1);
// stop the orbit so screenshots are comparable
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent === 'auto-spin'); if (b?.classList.contains('active')) b.click(); });

const report = [];
for (const spec of posesArg.split(',').map(s => s.trim()).filter(Boolean)) {
  const [clip, tStr = '0'] = spec.split('@');
  const r = await page.evaluate(({ clip, t }) => {
    const M = window.mosaic, THREE = M.THREE;
    const ci = M.clips.findIndex(c => c.name === clip);
    if (ci < 0) return { error: `no clip "${clip}" (have ${M.clips.map(c => c.name).join(', ')})` };

    // --- pose: exactly this clip at exactly time t, no cross-fade, then hold ---
    M.mixer.stopAllAction();
    M.mixer.timeScale = 1;
    const a = M.mixer.clipAction(M.clips[ci]); a.reset(); a.setEffectiveWeight(1); a.play();
    M.mixer.setTime(t);
    M.mixer.timeScale = 0;                  // the page's own loop keeps rendering this pose
    M.updateSkin(0);
    M.scene.updateMatrixWorld(true);

    // --- per-mesh triangles: bind pose (for attribution) and posed (oracle) ---
    const meshes = []; M.root.traverse(o => { if (o.isMesh && o.geometry?.attributes?.position) meshes.push(o); });
    const v = new THREE.Vector3();
    const tris = meshes.map(mesh => {
      const pos = mesh.geometry.attributes.position, idx = mesh.geometry.index;
      const nv = pos.count, bind = new Float32Array(nv * 3), posed = new Float32Array(nv * 3);
      for (let i = 0; i < nv; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        bind[i*3] = v.x; bind[i*3+1] = v.y; bind[i*3+2] = v.z;
        v.fromBufferAttribute(pos, i);
        if (mesh.isSkinnedMesh) mesh.applyBoneTransform(i, v);
        v.applyMatrix4(mesh.matrixWorld);
        posed[i*3] = v.x; posed[i*3+1] = v.y; posed[i*3+2] = v.z;
      }
      const nt = idx ? idx.count / 3 : nv / 3;
      const ix = new Uint32Array(nt * 3);
      for (let k = 0; k < nt * 3; k++) ix[k] = idx ? idx.getX(k) : k;
      return { name: mesh.name || mesh.uuid.slice(0, 6), bind, posed, ix, nt };
    });

    // Uniform grid over triangle AABBs, one per (mesh, pose), each sized from
    // the extent of ITS pose: bind-space samples and the rendered skin can
    // differ in scale (Michelle: 100x, a Mixamo cm→m wrapper the IBMs ignore).
    const extent = (key) => { const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
      for (const T of tris) for (let i = 0; i < T[key].length; i += 3) { lo.min(v.set(T[key][i], T[key][i+1], T[key][i+2])); hi.max(v); }
      return Math.max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z) || 1; };
    const cellOf = { bind: extent('bind') / 48, posed: extent('posed') / 48 };
    const height = extent('posed');              // errors are reported against the RENDERED size
    const K = (x, y, z) => (x + 1024) * 4194304 + (y + 1024) * 2048 + (z + 1024);
    function grid(P, ix, nt, cell) {
      const g = new Map(); g.cell = cell;
      for (let t = 0; t < nt; t++) {
        let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
        for (let c = 0; c < 3; c++) { const o = ix[t*3+c] * 3;
          x0 = Math.min(x0, P[o]); x1 = Math.max(x1, P[o]); y0 = Math.min(y0, P[o+1]); y1 = Math.max(y1, P[o+1]); z0 = Math.min(z0, P[o+2]); z1 = Math.max(z1, P[o+2]); }
        for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++)
          for (let gy = Math.floor(y0 / cell); gy <= Math.floor(y1 / cell); gy++)
            for (let gz = Math.floor(z0 / cell); gz <= Math.floor(z1 / cell); gz++) {
              const k = K(gx, gy, gz); let a = g.get(k); if (!a) g.set(k, a = []); a.push(t); }
      }
      return g;
    }
    const tri = new THREE.Triangle(), cp = new THREE.Vector3(), fn = new THREE.Vector3();
    function nearest(p, P, ix, g, maxR = 24) {
      const cell = g.cell;
      const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell), cz = Math.floor(p.z / cell);
      let best = Infinity, bestT = -1; const seen = new Set();
      for (let r = 0; r <= maxR; r++) {
        for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
          const a = g.get(K(cx + dx, cy + dy, cz + dz)); if (!a) continue;
          for (const t of a) {
            if (seen.has(t)) continue; seen.add(t);
            const ia = ix[t*3] * 3, ib = ix[t*3+1] * 3, ic = ix[t*3+2] * 3;
            tri.a.set(P[ia], P[ia+1], P[ia+2]); tri.b.set(P[ib], P[ib+1], P[ib+2]); tri.c.set(P[ic], P[ic+1], P[ic+2]);
            tri.closestPointToPoint(p, cp); const d = cp.distanceTo(p);
            if (d < best) { best = d; bestT = t; }
          }
        }
        if (bestT >= 0 && best <= r * cell) break;
      }
      return { d: best, t: bestT };
    }
    for (const T of tris) { T.gBind = grid(T.bind, T.ix, T.nt, cellOf.bind); T.gPosed = grid(T.posed, T.ix, T.nt, cellOf.posed); }

    // --- every tile, by CORRESPONDENCE: its own surface is the triangle
    // nearest its bind position; in the pose it is measured against that same
    // triangle, posed. (Nearest-surface in the pose would be fooled wherever
    // skin meets skin — an arm lowered against the torso finds the torso.) ---
    const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    const nz = new THREE.Vector3(), pb = new THREE.Vector3(), nb = new THREE.Vector3(), fb = new THREE.Vector3();
    const deg = (d) => Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI;
    const load = (P, ix, t) => { const ia = ix[t*3] * 3, ib = ix[t*3+1] * 3, ic = ix[t*3+2] * 3;
      tri.a.set(P[ia], P[ia+1], P[ia+2]); tri.b.set(P[ib], P[ib+1], P[ib+2]); tri.c.set(P[ic], P[ic+1], P[ic+2]); };
    const bindH = extent('bind');
    const per = new Map();
    for (const l of M.leaves) {
      pb.set(l.x, l.y, l.z);
      let src = null, st = -1, sd = Infinity;
      for (const T of tris) { const h = nearest(pb, T.bind, T.ix, T.gBind, 6); if (h.d < sd) { sd = h.d; src = T; st = h.t; } }
      if (!src || st < 0) continue;
      load(src.bind, src.ix, st); tri.getNormal(fb);
      const angBind = deg(nb.set(l.nx, l.ny, l.nz).normalize().dot(fb));
      l._mesh.getMatrixAt(l._idx, m4); m4.decompose(p, q, s);
      load(src.posed, src.ix, st); tri.closestPointToPoint(p, cp); tri.getNormal(fn);
      const angPose = deg(nz.set(0, 0, 1).applyQuaternion(q).dot(fn));
      let e = per.get(src.name); if (!e) per.set(src.name, e = { d: [], a: [], drift: [] });
      // how much further from its own surface the tile is than it was at bind
      e.d.push(Math.max(0, 100 * cp.distanceTo(p) / height - 100 * sd / bindH));
      e.a.push(angPose); e.drift.push(Math.abs(angPose - angBind));
    }
    const pct = (arr, f) => { if (!arr.length) return NaN; const a = Float64Array.from(arr).sort(); return a[Math.min(a.length - 1, Math.floor(f * a.length))]; };
    const out = {};
    for (const [name, e] of per) out[name] = {
      tiles: e.d.length,
      'off-surface% p50': +pct(e.d, .5).toFixed(2), 'p99': +pct(e.d, .99).toFixed(2), 'max': +pct(e.d, 1).toFixed(2),
      '>3% off': +(100 * e.d.filter(x => x > 3).length / e.d.length).toFixed(1) + '%',
      'normal° p50': +pct(e.a, .5).toFixed(1),
      'facing away': +(100 * e.a.filter(x => x > 90).length / e.a.length).toFixed(1) + '%',
      'drift° p50': +pct(e.drift, .5).toFixed(1), 'drift° p90': +pct(e.drift, .9).toFixed(1),
    };
    return { perMesh: out };
  }, { clip, t: +tStr });
  if (r.error) { console.log(`  ${spec}: ${r.error}`); continue; }
  console.log(`\n  ${model} ${spec}`);
  console.table(r.perMesh);
  report.push({ spec, ...r });

  if (shotDir) {
    const dir = path.resolve(shotDir); fs.mkdirSync(dir, { recursive: true });
    const tag = `${model}-${clip}-${tStr}`.toLowerCase();
    // front (orbited 180° from the default +Z framing) and side, tiles vs. plain mesh
    // the page's controls cover the lower body at this size — hide all UI, keep the canvas
    await page.evaluate(() => { for (const el of document.body.children) if (el.id !== 'app' && el.tagName !== 'SCRIPT') el.style.visibility = 'hidden'; });
    const views = [['front', Math.PI], ['side', Math.PI / 2]].filter(([v]) => !process.env.SHOT_VIEWS || process.env.SHOT_VIEWS.split(',').includes(v));
    for (const [view, yaw] of views) {
      await page.evaluate((yaw) => {
        const { camera, controls, THREE } = window.mosaic;
        if (!window.__home) window.__home = camera.position.clone();
        const off = window.__home.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        camera.position.copy(controls.target).add(off); controls.update();
      }, yaw);
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${dir}/${tag}-${view}-tiles.png` });
      await page.evaluate(() => {
        const M = window.mosaic;
        M.scene.traverse(o => { if (o.isInstancedMesh) o.visible = false; });
        M.root.traverse(o => { if (o.isMesh) o.visible = true; });
      });
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${dir}/${tag}-${view}-mesh.png` });
      await page.evaluate(() => {
        const M = window.mosaic;
        M.scene.traverse(o => { if (o.isInstancedMesh) o.visible = true; });
        M.root.traverse(o => { if (o.isMesh) o.visible = false; });
      });
    }
    await page.evaluate(() => { const { camera, controls } = window.mosaic; if (window.__home) { camera.position.copy(window.__home); controls.update(); } });
    await page.evaluate(() => { for (const el of document.body.children) el.style.visibility = ''; });
  }
}
console.log(`\npage errors: ${pageErrors}`);
if (process.env.JSON_OUT) fs.writeFileSync(process.env.JSON_OUT, JSON.stringify({ model, label, report }, null, 1));
await browser.close(); server.close();
