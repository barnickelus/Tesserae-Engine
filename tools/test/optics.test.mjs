// The tessera's optical rules (src/core/optics.ts), as properties:
// whatever a tile does up close, the light it sends must come out the same.
//   node --test test/*.test.mjs        (from tools/; Node ≥ 22 strips the types)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  srgbToLinear, linearToSrgb, luminance, linearMean, toksvig, faceSide,
  compensateFace, jointMix, equiluminant, describePatch,
} from '../../src/core/optics.ts';

const close = (a, b, eps = 1e-9, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} vs ${b}`);

test('sRGB round-trips, and a patch averages in LINEAR light', () => {
  for (let v = 0; v <= 1; v += 0.05) close(linearToSrgb(srgbToLinear(v)), v, 1e-9);
  // half black, half white sends half the light — not the sRGB midpoint's fifth
  const m = linearMean([[0, 0, 0], [1, 1, 1]]);
  close(m[0], 0.5, 1e-12);
  assert.ok(srgbToLinear(0.5) < 0.22, 'averaging encoded values would have given ~0.214');
});

test("Toksvig: a flat patch keeps its gloss; spread only ever roughens, and stays ≤ 1", () => {
  close(toksvig(0.3, 1), 0.3, 1e-12);
  let prev = 0.3;
  for (const nbar of [0.999, 0.99, 0.95, 0.9, 0.7, 0.4]) {
    const r = toksvig(0.3, nbar);
    assert.ok(r > prev && r <= 1, `monotone at |N̄|=${nbar}: ${r}`);
    prev = r;
  }
  close(toksvig(0, 0.001), 1, 0, 'a patch wrapping all the way round is fully rough');
});

test('faceSide covers exactly inset² of the projected patch, for any unit shape', () => {
  for (const [area, inset, unit] of [[2.5, 0.9, 1], [0.013, 0.8, 0.546], [7, 0.99, 0.4994]]) {
    const side = faceSide(area, inset, unit);
    close(side * side * unit, inset * inset * area, 1e-12);
  }
});

test('compensateFace pays the joint back: face + bed average to the source', () => {
  const bedTint = 0.5;
  for (const S of [[0.2, 0.1, 0.05], [0.5, 0.4, 0.3], [0.02, 0.3, 0.7]]) {
    for (const coverage of [0.98, 0.81, 0.64]) {
      const face = compensateFace(S, coverage, bedTint);
      const bed = S.map((v) => v * bedTint);
      const seen = jointMix(face, bed, coverage);
      for (let c = 0; c < 3; c++) close(seen[c], S[c], 1e-12, `c=${c} coverage=${coverage}`);
    }
  }
  // and a white that can't be paid back is clipped, not overflowed
  const w = compensateFace([0.95, 0.95, 0.95], 0.64, 0.5);
  assert.deepEqual(w, [1, 1, 1]);
});

test('equiluminant accents: exact luminance, in gamut, hue kept when it fits', () => {
  const Y = 0.3;
  for (const c of [[1, 0, 0], [0, 0, 1], [1, 1, 0], [0.2, 0.9, 0.4], [0.9, 0.5, 0.1]]) {
    const e = equiluminant(c, Y);
    close(luminance(e), Y, 1e-12, `Y of ${c}`);
    for (const v of e) assert.ok(v >= -1e-12 && v <= 1 + 1e-12, `gamut ${e}`);
  }
  // a dim yellow scaled down keeps its channel ratios exactly
  const e = equiluminant([0.8, 0.8, 0], 0.2);
  close(e[0] / e[1], 1, 1e-12); close(e[2], 0, 1e-12);
  // pure blue can't reach Y = 0.3 alone: it gives up saturation toward grey
  const b = equiluminant([0, 0, 1], 0.3);
  assert.ok(b[0] > 0.2 && Math.abs(b[0] - b[1]) < 1e-12, `grey mixed in: ${b}`);
  close(b[2], 1, 1e-9, 'blue channel at the gamut edge');
});

test('describePatch: centroid, face normal, projected area and the resting point', () => {
  // a shallow cap: z = 1 − r² over a small disc, normals pointing up and out
  const samples = [];
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
    const x = i * 0.05, y = j * 0.05, z = 1 - x * x - y * y;
    const nx = 2 * x, ny = 2 * y, l = Math.hypot(nx, ny, 1);
    samples.push({ position: [x, y, z], normal: [nx / l, ny / l, 1 / l], color: [0.5, 0.5, 0.5], roughness: 0.4, metalness: 1 });
  }
  const p = describePatch(samples, 0.0025);
  close(p.normal[2], 1, 1e-9, 'symmetric cap faces straight up');
  assert.ok(p.meanNormalLength < 1 && p.meanNormalLength > 0.95);
  close(p.projectedArea, p.area * p.meanNormalLength, 1e-12);
  // the apex (z = 1) is the highest point: the face rests there
  close(p.rise, 1 - p.centroid[2], 1e-12);
  assert.ok(p.rise > 0);
  close(p.metalness, 1, 0); close(p.roughness, 0.4, 1e-12);
});
