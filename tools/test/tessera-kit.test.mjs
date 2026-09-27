// examples/lib/tessera-kit.js — the tessera pipeline's maths, as properties.
//   node --test test/*.test.mjs        (from tools/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sampleSurfaces, layTesserae, TileDriver, decomposePure, srgbToLinear, luminance, toksvig, LAYING,
} from '../../examples/lib/tessera-kit.js';

const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} vs ${b}`);

// a flat grid in z = 0, facing +z, coloured by x (black → white, linear)
function grid(n = 24, size = 1) {
  const pos = [], nrm = [], col = [], idx = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const x = i / n * size, y = j / n * size;
    pos.push(x, y, 0); nrm.push(0, 0, 1); col.push(x / size, x / size, x / size);
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + 1, c = a + n + 2, d = a + n + 1;
    idx.push(a, b, c, a, c, d);
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nrm), colors: new Float32Array(col),
    index: new Uint32Array(idx), roughness: 0.4, metalness: 0 };
}

test('sampling is uniform in area, interpolates attributes, and never samples what is masked', () => {
  const g = grid();
  const S = sampleSurfaces([g], 20000, { seed: 1 });
  close(S.area, 1, 1e-9, 'area of a unit square');
  let mx = 0, my = 0; for (let i = 0; i < S.count; i++) { mx += S.x[i]; my += S.y[i]; }
  close(mx / S.count, 0.5, 0.01); close(my / S.count, 0.5, 0.01);
  for (let i = 0; i < S.count; i += 97) close(S.r[i], S.x[i], 1e-5, 'colour follows x');
  // hide the left half: no sample may land there
  const mask = new Float32Array(g.positions.length / 3).map((_, v) => g.positions[v * 3] < 0.5 ? 0 : 1);
  const H = sampleSurfaces([{ ...g, mask }], 5000, { seed: 2 });
  let minx = Infinity; for (let i = 0; i < H.count; i++) minx = Math.min(minx, H.x[i]);
  assert.ok(minx >= 0.5 - 1 / 24 - 1e-6, `masked half stays empty (min x ${minx})`);
});

test('importance-weighted sampling spends samples where tiles are small, and stays area-true', () => {
  const g = grid();
  const importance = new Float32Array(g.positions.length / 3).map((_, v) => g.positions[v * 3]);   // rises with x
  const S = sampleSurfaces([{ ...g, importance }], 40000, { seed: 5, boost: 9 });
  let W = 0, wx = 0, right = 0;
  for (let i = 0; i < S.count; i++) { W += S.wa[i]; wx += S.wa[i] * S.x[i]; if (S.x[i] > 0.5) right++; }
  close(W, 1, 1e-6, 'the samples still stand for exactly the surface');
  close(wx / W, 0.5, 0.01, 'area-weighted mean position is unbiased');
  assert.ok(right / S.count > 0.7, `denser where important (${(right / S.count).toFixed(2)} on the right half)`);
});

test('laying partitions the surface: every area counted once, colour averaged as light', () => {
  const S = sampleSurfaces([grid()], 60000, { seed: 3 });
  const { tiles, stats } = layTesserae(S, { maxDepth: 5 });
  assert.ok(tiles.length > 50, `${tiles.length} tiles`);
  let area = 0; for (const t of tiles) area += t.area;
  close(area, 1 - stats.orphans / S.count, 1e-6, 'tile areas sum to the sampled area (a flat patch projects to itself)');
  // a tile's colour is its patch's LINEAR mean: on a linear ramp that is the
  // ramp's value at the patch's centroid, so colour tracks position exactly
  for (const t of tiles) close(t.r, t.x, 0.02, 'linear mean at the centroid');
  // flat surface: no normal spread, so gloss is untouched
  for (const t of tiles) close(t.ro, 0.4, 1e-3, 'toksvig on a flat patch');
});

test('specular rides from part to tile as an area mean (default 1)', () => {
  // two abutting sheets, one at specular 0.3 and one unset: tiles on either
  // side carry their sheet's value, and a tile straddling the seam the mix
  const a = grid(), b = grid(); b.positions = b.positions.map((v, i) => i % 3 === 0 ? v + 1 : v);
  const S = sampleSurfaces([{ ...a, specular: 0.3 }, b], 60000, { seed: 7 });
  const { tiles } = layTesserae(S, { maxDepth: 5 });
  let left = 0, right = 0;
  for (const t of tiles) {
    assert.ok(t.sp >= 0.3 - 1e-9 && t.sp <= 1 + 1e-9, `sp ${t.sp} within its parts' range`);
    if (t.x < 0.8) { close(t.sp, 0.3, 1e-6, 'a tile on the 0.3 sheet'); left++; }
    if (t.x > 1.2) { close(t.sp, 1, 1e-6, 'a tile on the default sheet'); right++; }
  }
  assert.ok(left > 10 && right > 10, `${left} / ${right} tiles on each side`);
});

test('andamento across tile sizes: small and large tiles still partition the surface, each tile local', () => {
  // importance on the right half only: the octree cuts small tiles there and
  // large ones on the left, so the relaxation's neighbour lists span sizes
  const g = grid(32);
  const importance = new Float32Array(g.positions.length / 3).map((_, v) => g.positions[v * 3] > 0.5 ? 1 : 0);
  const S = sampleSurfaces([{ ...g, importance }], 40000, { seed: 6, boost: 4 });
  const { tiles, stats } = layTesserae(S, { maxDepth: 6 });
  const sizes = new Set(tiles.map((t) => t.s.toFixed(5)));
  assert.ok(sizes.size >= 2, `mixed sizes (${[...sizes].join(', ')})`);
  assert.equal(stats.orphans, 0, 'every sample owned');
  let area = 0; for (const t of tiles) area += t.area;
  close(area, 1, 1e-6, 'areas still sum to the surface');
  for (const t of tiles) assert.ok(t.area <= 2.25 * t.s * t.s, `a tile keeps to its own neighbourhood (${(t.area / t.s ** 2).toFixed(2)} s²)`);
});

test('Toksvig only ever roughens, and curved patches roughen more', () => {
  assert.equal(toksvig(0.3, 1), 0.3);
  assert.ok(toksvig(0.3, 0.98) > 0.3 && toksvig(0.3, 0.9) > toksvig(0.3, 0.98));
});

test('the driver moves tiles exactly as skinning + blendshapes move their patch', () => {
  const g = grid(8);
  const n = g.positions.length / 3;
  // one blendshape: lift everything by +0.1 in z; skin: every vertex on bone 1
  const lift = new Float32Array(n * 3); for (let v = 0; v < n; v++) lift[v * 3 + 2] = 0.1;
  const skinIndex = new Uint16Array(n * 4).map((_, k) => k % 4 === 0 ? 1 : 0);
  const skinWeight = new Float32Array(n * 4).map((_, k) => k % 4 === 0 ? 1 : 0);
  const S = sampleSurfaces([{ ...g, morphs: [lift], skinIndex, skinWeight }], 8000, { seed: 4, morphCount: 1 });
  const { tiles } = layTesserae(S, { maxDepth: 3, levels: 1, laying: { ...LAYING, andamento: { ...LAYING.andamento, on: false } } });
  const ids = tiles.map((_, i) => i);
  const mesh = { instanceMatrix: { array: new Float32Array(tiles.length * 16), needsUpdate: false } };
  const q = new Float32Array(tiles.length * 4), scale = new Float32Array(tiles.length * 3).fill(1);
  for (let i = 0; i < tiles.length; i++) q[i * 4 + 3] = 1;
  const base = new Float32Array(tiles.length * 3);
  tiles.forEach((t, i) => base.set([t.x, t.y, t.z], i * 3));
  const D = new TileDriver(tiles, [{ mesh, ids, q, scale, base }]);
  // bone 0: identity; bone 1: a quarter turn about +y, then a shift of +2 in x
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const R = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 2, 0, 0, 1];   // column-major: x→-z, z→x, +2 x
  const mats = new Float32Array([...I, ...R]);
  const s = Math.SQRT1_2, quats = new Float32Array([0, 0, 0, 1, 0, s, 0, s]);
  D.update(mats, quats, [1]);
  const E = mesh.instanceMatrix.array;
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i], px = t.x + t.morph[0], py = t.y + t.morph[1], pz = t.z + t.morph[2];
    close(t.morph[2], 0.1, 1e-6, 'patch moves with its blendshape');
    close(E[i * 16 + 12], pz + 2, 1e-5, 'x'); close(E[i * 16 + 13], py, 1e-5, 'y'); close(E[i * 16 + 14], -px, 1e-5, 'z');
    // the tile's +x axis turned with the bone: x → -z
    close(E[i * 16 + 0], 0, 1e-5); close(E[i * 16 + 2], -1, 1e-5);
  }
  assert.equal(mesh.instanceMatrix.needsUpdate, true);
});

test('divisionist paint: accents share the target luminance, and the coverage-weighted mix is the target', () => {
  const cov = { a: 0.3, b: 0.08, base: 0.62 };
  for (const target of [[0.45, 0.25, 0.18], [0.08, 0.06, 0.05], [0.3, 0.4, 0.6]]) {
    const [base, A, B] = decomposePure(target, cov);
    const Y = luminance(...target);
    close(luminance(...A), luminance(...B), 0.02, 'accents equiluminant with each other');
    for (let c = 0; c < 3; c++) close(cov.base * base[c] + cov.a * A[c] + cov.b * B[c], target[c], 0.01, `mix channel ${c}`);
    assert.ok(Math.abs(luminance(...A) - Y) < 0.02, 'and with the target');
  }
  assert.ok(srgbToLinear(0.5) < 0.22);
});
