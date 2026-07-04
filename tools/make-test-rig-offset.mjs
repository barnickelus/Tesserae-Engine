// Same 2-bone "arm" rig as make-test-rig.mjs, but the whole thing sits under
// a root Group with a NON-TRIVIAL transform (position + rotation) -- testing
// whether buildSampler's bindMatrix assumption holds when the skinned mesh
// isn't sitting at the world origin, which is the realistic case for any
// authored character (unlike the origin-centered first test rig).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const ROOT = '/home/user/Tesserae-Engine';
const TMOD = path.resolve(path.dirname(createRequire(import.meta.url).resolve('three')), '..');
const EXE = fs.readdirSync('/opt/pw-browsers').filter(d => d.startsWith('chromium-')).map(d => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find(fs.existsSync);
const OUT = process.argv[2] || 'test-rig-offset.glb';

const HTML = `<!DOCTYPE html><html><body><script type="importmap">
{ "imports": { "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
  "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/" } }
</script>
<script type="module">
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const H = 4, SEGS = 24;
const geo = new THREE.BoxGeometry(0.4, H, 0.4, 1, SEGS, 1);
geo.translate(0, H/2, 0);

const pos = geo.attributes.position;
const n = pos.count;
const skinIndices = new Uint16Array(n * 4);
const skinWeights = new Float32Array(n * 4);
for (let i = 0; i < n; i++) {
  const y = pos.getY(i);
  let w1 = THREE.MathUtils.clamp((y - 1.5) / 1.0, 0, 1);
  skinIndices[i*4] = 0; skinIndices[i*4+1] = 1;
  skinWeights[i*4] = 1 - w1; skinWeights[i*4+1] = w1;
}
geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

const mat = new THREE.MeshStandardMaterial({ color: 0x55aadd });
const mesh = new THREE.SkinnedMesh(geo, mat);

const bone0 = new THREE.Bone(); bone0.position.set(0, 0, 0); bone0.name = 'hip';
const bone1 = new THREE.Bone(); bone1.position.set(0, 2, 0); bone1.name = 'elbow';
bone0.add(bone1);
mesh.add(bone0);
const skeleton = new THREE.Skeleton([bone0, bone1]);
mesh.bind(skeleton);

// NON-TRIVIAL root transform: offset position + rotation, like a real authored character
const armature = new THREE.Group(); armature.name = 'Armature';
armature.position.set(3, 1, -2);
armature.rotation.set(0, 0.7, 0);
armature.add(mesh); armature.add(bone0);

const root = new THREE.Group(); root.add(armature);
root.updateMatrixWorld(true);

const track = new THREE.QuaternionKeyframeTrack('elbow.quaternion',
  [0, 1, 2],
  [0,0,0,1,  0.7071,0,0,0.7071,  0,0,0,1]);
const clip = new THREE.AnimationClip('Swing', 2, [track]);

const exporter = new GLTFExporter();
window.__done = false; window.__buf = null;
exporter.parse(root, (result) => {
  window.__buf = result; window.__done = true;
}, (e) => { window.__err = String(e); window.__done = true; },
{ binary: true, animations: [clip] });
</script></body></html>`;

const dumpHtmlPath = path.join(ROOT, '_tmp_make_rig_offset.html');
fs.writeFileSync(dumpHtmlPath, HTML);
const MIME = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(file, (err, data) => { if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }); res.end(data); });
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.route('**unpkg.com/**', (route) => {
  const rel = new URL(route.request().url()).pathname.replace(/^\/three@[^/]+\//, '');
  try { route.fulfill({ body: fs.readFileSync(path.join(TMOD, rel)), headers: { 'Content-Type': 'text/javascript' } }); } catch { route.abort(); }
});
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,300)));
await page.goto(`http://localhost:${port}/_tmp_make_rig_offset.html`, { waitUntil: 'load', timeout: 30000 });
await page.waitForFunction(() => window.__done === true, { timeout: 30000 });
const err = await page.evaluate(() => window.__err);
if (err) { console.log('export failed:', err); process.exit(1); }
const buf = await page.evaluate(() => Array.from(new Uint8Array(window.__buf)));
fs.writeFileSync(OUT, Buffer.from(buf));
console.log('wrote', OUT, fs.statSync(OUT).size, 'bytes');
await browser.close(); server.close();
fs.unlinkSync(dumpHtmlPath);
