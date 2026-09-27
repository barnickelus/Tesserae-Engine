// Likeness check: how close is VibeMesh's avatar to the person the camera saw?
//
//   node likeness-check.mjs <data.json> [ppd,…] [heat.png]
//
// data.json is what `window.mosaic.likenessData('center')` returns on
// examples/tessera-vibemesh.html after a calibration: the front calibration
// photo, the avatar rendered through that photo's own (fitted) camera and
// composited over it, and the face mask (inside the tracked face outline,
// minus the eyes' and mouth's openings, where a photo and an avatar hold
// different things). The avatar render goes through the screen's own pipeline
// (tone curve, exposure), so it is what a viewer sees.
//
// The comparison is the optics check's eye (lib/scielab.mjs): S-CIELAB ΔE at a
// ladder of viewing distances (pixels per degree; more = further away), the
// signed lightness bias ΔL*, the chroma difference ΔC, and an SSIM of the
// eye-filtered lightness ("form"), all over the face mask. With a heat-map
// path it also writes photo | avatar | ΔE (at the middle ppd, 40 ΔE = white)
// and prints both images' mean sRGB over the face.
import fs from 'node:fs';
import { toOpponent, eyeLab, ssim, png } from './lib/scielab.mjs';

const [file, ppdArg = '30,60,120,240', heat] = process.argv.slice(2);
if (!file) { console.error('usage: node likeness-check.mjs <data.json> [ppd,…] [heat.png]'); process.exit(1); }
const d = JSON.parse(fs.readFileSync(file, 'utf8'));
const PPD = ppdArg.split(',').map(Number), W = d.W, H = d.H, b64 = (s) => Buffer.from(s, 'base64');
// the page sends top-down rows; toOpponent reads bottom-up (gl.readPixels order)
const flip = (rgba) => { const o = new Uint8Array(W * H * 4); for (let y = 0; y < H; y++) o.set(rgba.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4); return o; };
const Pt = b64(d.photo), At = b64(d.avatar), M0 = b64(d.mask), mask = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) mask[i] = M0[i] ? 1 : 0;          // top-down, as toOpponent's planes are
const Op = toOpponent(flip(Pt), W, H), Oa = toOpponent(flip(At), W, H), rows = {};
let px = 0; for (const v of mask) px += v;
const labs = {};
for (const ppd of PPD) {
  const a = eyeLab(Op, W, H, ppd), c = eyeLab(Oa, W, H, ppd); labs[ppd] = [a, c];
  let dE = 0, dL = 0, dC = 0, n = 0;
  for (let i = 0; i < W * H; i++) if (mask[i]) {
    const l = c.L[i] - a.L[i], aa = c.A[i] - a.A[i], bb = c.B[i] - a.B[i];
    dE += Math.hypot(l, aa, bb); dL += l; dC += Math.hypot(aa, bb); n++;
  }
  rows[`${ppd} ppd`] = { 'ΔE': +(dE / n).toFixed(2), 'ΔL*': +(dL / n).toFixed(2), 'ΔC': +(dC / n).toFixed(2), form: +ssim(a.L, c.L, W, H, mask).toFixed(3) };
}
console.log(`face pixels ${px}`); console.table(rows);

if (heat) {
  const [a, c] = labs[PPD[Math.floor(PPD.length / 2)]], out = new Uint8Array(W * 3 * H * 3), sp = [0, 0, 0], sa = [0, 0, 0];
  let n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, o = (y * W * 3 + x) * 3;
    for (let k = 0; k < 3; k++) { out[o + k] = Pt[i * 4 + k]; out[o + W * 3 + k] = At[i * 4 + k]; }
    const e = mask[i] ? Math.min(1, Math.hypot(c.L[i] - a.L[i], c.A[i] - a.A[i], c.B[i] - a.B[i]) / 40) : 0;
    const edge = mask[i] && (!mask[i - 1] || !mask[i + 1] || !mask[i - W] || !mask[i + W]);
    out[o + 2 * W * 3] = edge ? 0 : 255 * Math.min(1, e * 2.2);
    out[o + 2 * W * 3 + 1] = edge ? 255 : 255 * Math.max(0, Math.min(1, e * 2.2 - 0.6));
    out[o + 2 * W * 3 + 2] = edge ? 0 : 255 * Math.max(0, e * 3 - 2);
    if (mask[i]) { n++; for (let k = 0; k < 3; k++) { sp[k] += Pt[i * 4 + k]; sa[k] += At[i * 4 + k]; } }
  }
  console.log('mean sRGB over the face: photo', sp.map((v) => (v / n).toFixed(0)).join(','), ' avatar', sa.map((v) => (v / n).toFixed(0)).join(','));
  fs.writeFileSync(heat, png(W * 3, H, out));
}
