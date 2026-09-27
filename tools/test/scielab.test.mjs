// Does the eye model see what eyes see? Known results from vision science:
//   · identical images differ by 0;
//   · a fine checkerboard fuses into its average colour as the viewer backs away;
//   · an ISOLUMINANT (red–green) checkerboard fuses far sooner than a LUMINANCE
//     one of the same nominal contrast — chroma is blurred more than luminance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toOpponent, eyeLab } from '../lib/scielab.mjs';

const W = 240, H = 240, CELL = 4;
const enc = v => { v = Math.min(1, Math.max(0, v)); return Math.round(255 * (v <= 0.0031308 ? 12.92*v : 1.055*Math.pow(v, 1/2.4) - 0.055)); };
function image(colourAt) {   // bottom-up RGBA, like gl.readPixels
  const px = new Uint8Array(W*H*4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = colourAt(x, y), s = (y*W + x)*4; px[s] = enc(c[0]); px[s+1] = enc(c[1]); px[s+2] = enc(c[2]); px[s+3] = 255; }
  return px;
}
const T = [0.25, 0.20, 0.15];                                  // linear target (a warm mid tone)
const Y = c => 0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2];
const chk = (a, b) => (x, y) => ((Math.floor(x/CELL) + Math.floor(y/CELL)) & 1 ? a : b);
const lumA = T.map(v => v*1.25), lumB = T.map(v => v*0.75);   // same chroma, ±25% luminance
const d = [0.06, -0.06*0.2126/0.7152, 0];                      // a red–green direction with Y(d) = 0
const isoA = T.map((v, i) => v + d[i]), isoB = T.map((v, i) => v - d[i]);
function meanDE(a, b, ppd) {
  const A = eyeLab(toOpponent(a, W, H), W, H, ppd), B = eyeLab(toOpponent(b, W, H), W, H, ppd);
  let s = 0, n = 0;
  for (let y = 40; y < H - 40; y++) for (let x = 40; x < W - 40; x++) { const i = y*W + x; s += Math.hypot(A.L[i]-B.L[i], A.A[i]-B.A[i], A.B[i]-B.B[i]); n++; }
  return s / n;
}
const flat = image(() => T);

test('identical images differ by nothing', () => {
  assert.equal(meanDE(flat, flat, 60), 0);
});
test('the iso pair really is isoluminant, and the checkerboards average to the target', () => {
  assert.ok(Math.abs(Y(isoA) - Y(isoB)) < 1e-9);
  for (const [a, b] of [[lumA, lumB], [isoA, isoB]]) for (let c = 0; c < 3; c++) assert.ok(Math.abs((a[c] + b[c])/2 - T[c]) < 1e-9);
});
test('checkerboards fuse with distance; the isoluminant one fuses far sooner', () => {
  const lum = image(chk(lumA, lumB)), iso = image(chk(isoA, isoB)), rows = [];
  // plain (unfiltered) contrast of each pattern, for a fair comparison
  const plainL = meanDE(image(() => lumA), image(() => lumB), 1e-3), plainI = meanDE(image(() => isoA), image(() => isoB), 1e-3);
  for (const ppd of [15, 30, 60, 120, 240]) rows.push({ ppd, lum: meanDE(lum, flat, ppd) / plainL, iso: meanDE(iso, flat, ppd) / plainI });
  console.log(`  plain contrast — luminance pair ΔE ${plainL.toFixed(1)}, isoluminant pair ΔE ${plainI.toFixed(1)}`);
  console.table(Object.fromEntries(rows.map(r => [`${r.ppd} ppd`, { 'luminance visible': r.lum.toFixed(3), 'isoluminant visible': r.iso.toFixed(3), ratio: (r.iso / r.lum).toFixed(2) }])));
  // fades with distance, down to a floor of ~0.02 (≈0.3 ΔE: the 8-bit
  // quantisation of the checker colours, far below a visible difference)
  for (let k = 1; k < rows.length; k++) { assert.ok(rows[k].lum <= rows[k-1].lum + 0.01); assert.ok(rows[k].iso <= rows[k-1].iso + 0.01); }
  for (const r of rows.filter(r => r.lum > 0.05)) assert.ok(r.iso < 0.3 * r.lum, `at ${r.ppd} ppd the chroma pattern should be far less visible`);
  assert.ok(rows.at(-1).iso < 0.05 && rows.at(-1).lum < 0.05, 'both fully fused far away');
});
