/**
 * tessera-kit — the tessera's optical language as a module any page can use.
 *
 * A tessera stands for a patch of surface, is seen only by the light that
 * reaches it, and is read by an eye whose acuity falls with distance
 * (docs/optical-language.md has the rules and the measurements behind them;
 * src/core/optics.ts is their tested reference). This module carries them
 * to any surface — a scanned bust, a skinned rig, a generated face:
 *
 *   sampleSurfaces   surfaces → samples, uniform in area, each carrying its
 *                    colour, surface, skin binding and blendshape deltas
 *   layTesserae      samples → tiles. An importance octree decides WHERE tiles
 *                    go and HOW BIG; andamento decides how they RUN; every tile
 *                    is the pre-filtered patch of surface it owns
 *   buildTileMeshes  tiles → instanced meshes with the tile shader (its own
 *                    gloss, divisionist paint, mortar-packed sides)
 *   TileDriver       bone matrices + blendshape weights → every tile's matrix,
 *                    each frame, so the mosaic moves as the surface does
 *   bedMaterial      the setting bed the tiles are pressed into
 *   visibleVertices  which of the surface any view can see — only that is laid
 *                    (a surface inside another would poke tiles through it)
 *   createLayer      sampling + laying in a module worker (tessera-worker.js),
 *                    so a rebuild never stalls the page that asked for it
 *
 * No imports: three.js is passed in where GPU objects are made, so everything
 * else runs — and is tested (tools/test/tessera-kit.test.mjs) — in Node.
 * examples/tessera-mosaic.html predates the kit and still carries its own copy
 * of these rules; examples/tessera-vibemesh.html is built on it.
 */

// ---- light is additive in LINEAR units ----------------------------------
export const srgbToLinear = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
export const linearToSrgb = (c) => c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(Math.max(0, c), 1 / 2.4) - 0.055;
export const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Toksvig: a flat face absorbs its patch's lost normal spread into roughness. */
export function toksvig(roughness, meanNormalLength) {
  const nbar = Math.max(1e-3, Math.min(1, meanNormalLength)), sigma2 = (1 - nbar) / nbar;
  return Math.min(1, Math.pow(roughness ** 4 + 2 * sigma2, 0.25));
}
/** The face value that pays back its joint: c·T + (1−c)·tint·S = S (clipped at 1). */
export const compensate = (v, coverage, bedTint) => Math.min(1, v * (1 - (1 - coverage) * bedTint) / coverage);

/** Scale a linear colour to luminance Y, giving up just enough saturation to stay in gamut. */
export function equiluminant(r, g, b, Y) {
  const y0 = luminance(r, g, b);
  if (y0 <= 1e-6) return [Y, Y, Y];
  const s = Y / y0; r *= s; g *= s; b *= s;
  let k = 0;
  for (const v of [r, g, b]) if (v > 1) k = Math.max(k, (v - 1) / (v - Y));
  return [r + (Y - r) * k, g + (Y - g) * k, b + (Y - b) * k];
}

export function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const hash01 = (i, salt) => mulberry32((i * 0x9E3779B1) ^ salt)();

// sRGB-encoded HSL, the same formulas as THREE.Color
export function rgbToHsl(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l <= 0.5 ? d / (mx + mn) : d / (2 - mx - mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
export function hslToRgb(h, s, l) {
  h = ((h % 1) + 1) % 1; s = Math.min(1, Math.max(0, s)); l = Math.min(1, Math.max(0, l));
  if (s === 0) return [l, l, l];
  const q = l <= 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const hue = (t) => { t = ((t % 1) + 1) % 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * 6 * (2 / 3 - t) : p; };
  return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)];
}

// ═══ 1. SAMPLING ═════════════════════════════════════════════════════════
/**
 * Area-uniform samples over one or more triangle surfaces.
 *
 * A part: { positions (xyz per vertex, in the skeleton's BIND space),
 *   normals, index?, colors? (linear rgb per vertex) | color ([r,g,b] linear),
 *   roughness, metalness, specular? (0–1, a dielectric's reflectance scale —
 *   three's specularIntensity; default 1), skinIndex?/skinWeight? (4 per
 *   vertex) | rigidBone,
 *   morphs? (array of per-vertex xyz DELTAS, one per blendshape),
 *   importance? (0–1 per vertex: features that deserve small tiles),
 *   mask? (0–1 per vertex: < 0.5 = hidden, e.g. scalp under hair) }
 *
 * boost: spend samples where tiles will be small — a triangle is drawn in
 * proportion to area·(1 + boost·importance), and each sample carries the
 * area it stands for (wa), so every average stays area-true.
 *
 * Returns struct-of-arrays: x y z nx ny nz, r g b (linear) and sr sg sb (the
 * same colour sRGB-encoded — what the eye's differences are measured in),
 * ro me sp imp part wa, skinIdx/skinWt (4 each), morph (M·3 each), and the
 * total area.
 */
export function sampleSurfaces(parts, count, { seed = 0xC0FFEE, morphCount = 0, boost = 0 } = {}) {
  const M = morphCount;
  let triTotal = 0;
  for (const p of parts) triTotal += (p.index ? p.index.length : p.positions.length / 3) / 3;
  const cum = new Float64Array(triTotal), triPart = new Int32Array(triTotal), triLocal = new Int32Array(triTotal), triW = new Float32Array(triTotal);
  let run = 0, trueArea = 0, g = 0;
  parts.forEach((p, pi) => {
    const P = p.positions, I = p.index, nt = (I ? I.length : P.length / 3) / 3, mask = p.mask;
    for (let t = 0; t < nt; t++, g++) {
      const a = I ? I[t * 3] : t * 3, b = I ? I[t * 3 + 1] : t * 3 + 1, c = I ? I[t * 3 + 2] : t * 3 + 2;
      const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
      const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
      let area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
      if (mask && (mask[a] + mask[b] + mask[c]) / 3 < 0.5) area = 0;   // hidden: never sampled
      const w = 1 + boost * (p.importance ? (p.importance[a] + p.importance[b] + p.importance[c]) / 3 : 0);
      trueArea += area; run += area * w; cum[g] = run; triPart[g] = pi; triLocal[g] = t; triW[g] = w;
    }
  });
  const n = count, rnd = mulberry32(seed);
  const S = {
    count: n, area: trueArea, morphCount: M, wa: new Float32Array(n),
    x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n),
    nx: new Float32Array(n), ny: new Float32Array(n), nz: new Float32Array(n),
    r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n),
    sr: new Float32Array(n), sg: new Float32Array(n), sb: new Float32Array(n),
    ro: new Float32Array(n), me: new Float32Array(n), sp: new Float32Array(n), imp: new Float32Array(n), part: new Uint16Array(n),
    skinIdx: new Uint16Array(n * 4), skinWt: new Float32Array(n * 4),
    morph: M ? new Float32Array(n * M * 3) : null,
  };
  if (run <= 0) { S.count = 0; return S; }
  for (let i = 0; i < n; i++) {
    const want = rnd() * run; let lo = 0, hi = triTotal - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < want) lo = m + 1; else hi = m; }
    const p = parts[triPart[lo]], t = triLocal[lo], I = p.index, P = p.positions, N = p.normals;
    const a = I ? I[t * 3] : t * 3, b = I ? I[t * 3 + 1] : t * 3 + 1, c = I ? I[t * 3 + 2] : t * 3 + 2;
    let u = rnd(), v = rnd(); if (u + v > 1) { u = 1 - u; v = 1 - v; } const w = 1 - u - v;
    const L = (A, k, s = 3) => A[a * s + k] * w + A[b * s + k] * u + A[c * s + k] * v;
    S.x[i] = L(P, 0); S.y[i] = L(P, 1); S.z[i] = L(P, 2);
    let nx = L(N, 0), ny = L(N, 1), nz = L(N, 2); const nl = Math.hypot(nx, ny, nz) || 1;
    S.nx[i] = nx / nl; S.ny[i] = ny / nl; S.nz[i] = nz / nl;
    const C = p.colors;
    const r = C ? L(C, 0) : p.color[0], gg = C ? L(C, 1) : p.color[1], bb = C ? L(C, 2) : p.color[2];
    S.r[i] = r; S.g[i] = gg; S.b[i] = bb;
    S.sr[i] = linearToSrgb(r); S.sg[i] = linearToSrgb(gg); S.sb[i] = linearToSrgb(bb);
    S.ro[i] = p.roughness ?? 0.6; S.me[i] = p.metalness ?? 0; S.sp[i] = p.specular ?? 1;
    S.imp[i] = p.importance ? L(p.importance, 0, 1) : 0;
    S.part[i] = triPart[lo];
    S.wa[i] = run / n / triW[lo];                       // the area this sample stands for
    if (p.skinIndex) {
      // the dominant corner carries the binding (a tile is rigid; see layTesserae)
      const d = (w >= u && w >= v) ? a : (u >= v ? b : c);
      let sum = 0; for (let k = 0; k < 4; k++) sum += p.skinWeight[d * 4 + k];
      for (let k = 0; k < 4; k++) {
        S.skinIdx[i * 4 + k] = p.skinIndex[d * 4 + k];
        S.skinWt[i * 4 + k] = sum > 0 ? p.skinWeight[d * 4 + k] / sum : (k === 0 ? 1 : 0);
      }
    } else { S.skinIdx[i * 4] = p.rigidBone ?? 0; S.skinWt[i * 4] = 1; }
    if (M && p.morphs) for (let k = 0; k < Math.min(M, p.morphs.length); k++) {
      const D = p.morphs[k], o = (i * M + k) * 3;
      S.morph[o] = L(D, 0); S.morph[o + 1] = L(D, 1); S.morph[o + 2] = L(D, 2);
    }
  }
  // the weights are a Monte-Carlo estimate; the total is known exactly — pin it
  let W = 0; for (let i = 0; i < n; i++) W += S.wa[i];
  if (W > 0) for (let i = 0; i < n; i++) S.wa[i] *= trueArea / W;
  return S;
}

// ═══ 2. LAYING ═══════════════════════════════════════════════════════════
// A hash of points over a uniform grid of cell h spanning [o, o + extent]:
// put() a point in its cell, visit() the points of every cell a query box
// touches. Keys stay small integers (V8 hashes those fastest).
function pointGrid(h, ox, oy, oz, extent) {
  const map = new Map(), P = 2, K = Math.ceil(extent / h) + 2 * P + 1;
  const cell = (v, o) => Math.min(K - 1, Math.max(0, Math.floor((v - o) / h) + P));
  return {
    put(id, x, y, z) {
      const k = (cell(x, ox) * K + cell(y, oy)) * K + cell(z, oz); let l = map.get(k); if (!l) map.set(k, l = []); l.push(id);
    },
    visit(x, y, z, r, fn) {
      const x0 = cell(x - r, ox), x1 = cell(x + r, ox), y0 = cell(y - r, oy), y1 = cell(y + r, oy), z0 = cell(z - r, oz), z1 = cell(z + r, oz);
      for (let a = x0; a <= x1; a++) for (let b = y0; b <= y1; b++) for (let c = z0; c <= z1; c++) {
        const l = map.get((a * K + b) * K + c); if (l) for (const id of l) fn(id);
      }
    },
  };
}
// courses run horizontally by default: e1 = UP × n (a latitude), e2 = n × e1
function courseFrame(nx, ny, nz, out, o) {
  let ax = nz, ay = 0, az = -nx, l = Math.hypot(ax, az);
  if (l < 1e-4) { ax = 0; ay = nz; az = -ny; l = Math.hypot(ay, az); }
  ax /= l; ay /= l; az /= l;
  out[o] = ax; out[o + 1] = ay; out[o + 2] = az;
  out[o + 3] = ny * az - nz * ay; out[o + 4] = nz * ax - nx * az; out[o + 5] = nx * ay - ny * ax;
}

export const LAYING = {
  subThreshold: 0.24,   // importance needed to split deeper
  curvForce: 0.38,      // a cell wrapping a curved form can't be one tile
  minSamples: 6,
  semantic: true,       // the samples' own importance picks a target size: 0 → the
                        // largest tiles, 1 → the smallest (a generator's feature masks)
  andamento: { on: true, edgeGain: 0.6, course: 0.08, spread: 0.85, smooth: 14, rounds: 6, facing: -0.3, depth: 2 },
};

/**
 * Samples → tiles. levels: the octree depths used (maxDepth-2 … maxDepth, plus
 * one forced level for wrap-around cells). Each tile is the pre-filtered
 * patch it owns: linear-light colour, Toksvig roughness, its face point (the
 * patch's high point along its normal, where a flat tile rests), its
 * projected area, its skin binding and its mean blendshape deltas.
 */
export function layTesserae(S, { maxDepth = 7, levels = 3, laying = LAYING } = {}) {
  const n = S.count, M = S.morphCount;
  if (!n) return { tiles: [], stats: { tiles: 0 } };
  let minx = Infinity, miny = Infinity, minz = Infinity, maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
  for (let i = 0; i < n; i++) {
    if (S.x[i] < minx) minx = S.x[i]; if (S.x[i] > maxx) maxx = S.x[i];
    if (S.y[i] < miny) miny = S.y[i]; if (S.y[i] > maxy) maxy = S.y[i];
    if (S.z[i] < minz) minz = S.z[i]; if (S.z[i] > maxz) maxz = S.z[i];
  }
  const size = Math.max(maxx - minx, maxy - miny, maxz - minz) * 1.001;
  const ox = (minx + maxx - size) / 2, oy = (miny + maxy - size) / 2, oz = (minz + maxz - size) / 2;
  const minDepth = maxDepth - (levels - 1);
  const WA = S.wa || new Float32Array(n).fill(S.area / n);
  const clock = () => globalThis.performance.now(), ms = {}; let t0 = clock();

  // every mean is AREA-weighted: samples may be denser where tiles are small
  function stats(ids) {
    const m = ids.length;
    let W = 0, px = 0, py = 0, pz = 0, nx = 0, ny = 0, nz = 0, r = 0, g = 0, b = 0, sr = 0, sg = 0, sb = 0, ro = 0, me = 0, sp = 0, sem = 0;
    for (let k = 0; k < m; k++) { const i = ids[k], w = WA[i]; W += w;
      px += w * S.x[i]; py += w * S.y[i]; pz += w * S.z[i]; nx += w * S.nx[i]; ny += w * S.ny[i]; nz += w * S.nz[i];
      r += w * S.r[i]; g += w * S.g[i]; b += w * S.b[i]; sr += w * S.sr[i]; sg += w * S.sg[i]; sb += w * S.sb[i];
      ro += w * S.ro[i]; me += w * S.me[i]; sp += w * (S.sp ? S.sp[i] : 1); sem += w * S.imp[i]; }
    px /= W; py /= W; pz /= W; sr /= W; sg /= W; sb /= W; ro /= W; me /= W; sp /= W; sem /= W;
    let cvar = 0, mvar = 0;
    for (let k = 0; k < m; k++) { const i = ids[k], w = WA[i];
      const dr = S.sr[i] - sr, dg = S.sg[i] - sg, db = S.sb[i] - sb; cvar += w * (dr * dr + dg * dg + db * db);
      mvar += w * (S.me[i] - me) ** 2; }
    cvar /= W; mvar /= W;
    const nl = Math.hypot(nx, ny, nz) || 1, curv = 1 - nl / W;
    const importance = Math.min(1, cvar * 7 + mvar * 1.5 + curv * 0.85);
    return { m, W, px, py, pz, ux: nx / nl, uy: ny / nl, uz: nz / nl, r: r / W, g: g / W, b: b / W, sr, sg, sb, ro, me, sp, curv, imp: importance, sem };
  }

  // 1. WHERE and HOW BIG — the importance octree
  const all = new Int32Array(n); for (let i = 0; i < n; i++) all[i] = i;
  const seeds = [], depthCount = {};
  const stack = [{ x: ox, y: oy, z: oz, s: size, d: 0, ids: all }];
  while (stack.length) {
    const c = stack.pop(), ids = c.ids, m = ids.length, st = stats(ids);
    // semantic size: the samples' own importance picks how deep this cell goes
    const want = laying.semantic ? minDepth + Math.round(Math.min(1, st.sem) * (maxDepth - minDepth)) : minDepth;
    const split = c.d < minDepth || (c.d < want && m >= laying.minSamples) ||
      (c.d < maxDepth && m >= laying.minSamples && (st.imp > laying.subThreshold || st.curv > laying.curvForce)) ||
      (st.curv > laying.curvForce && m >= 2 && c.d < maxDepth + 1);
    if (split) {
      const h = c.s / 2, mx = c.x + h, my = c.y + h, mz = c.z + h, kids = [[], [], [], [], [], [], [], []];
      for (let k = 0; k < m; k++) { const i = ids[k]; kids[(S.x[i] >= mx ? 1 : 0) | (S.y[i] >= my ? 2 : 0) | (S.z[i] >= mz ? 4 : 0)].push(i); }
      for (let o = 0; o < 8; o++) if (kids[o].length)
        stack.push({ x: c.x + (o & 1 ? h : 0), y: c.y + (o & 2 ? h : 0), z: c.z + (o & 4 ? h : 0), s: h, d: c.d + 1, ids: kids[o] });
    } else {
      seeds.push({ x: st.px, y: st.py, z: st.pz, nx: st.ux, ny: st.uy, nz: st.uz, s: c.s, d: c.d, ids });
      depthCount[c.d] = (depthCount[c.d] || 0) + 1;
    }
  }
  ms.octree = clock() - t0; t0 = clock();
  // 2. HOW THEY RUN — andamento (or each tile keeps its cell)
  const patches = laying.andamento.on ? andamento(seeds, S, ox, oy, oz, size, laying.andamento)
    : seeds.map((sd) => { const F = new Float64Array(6); courseFrame(sd.nx, sd.ny, sd.nz, F, 0);
        return { ids: sd.ids, dir: [F[0], F[1], F[2]], conf: 0, contour: null }; });

  ms.andamento = clock() - t0; t0 = clock();
  // 3. WHAT EACH SHOWS — the pre-filtered patch. Per-tile bindings live in
  // three packed arrays (views per tile), so a worker hands them back whole.
  const tiles = [], packMorph = M ? new Float32Array(seeds.length * M * 3) : null;
  const packIdx = new Uint16Array(seeds.length * 4), packWt = new Float32Array(seeds.length * 4);
  for (let q = 0; q < seeds.length; q++) {
    const pa = patches[q]; if (!pa) continue;
    const ids = pa.ids, m = ids.length, s0 = seeds[q].s, st = stats(ids);
    const { px, py, pz, ux, uy, uz, curv } = st;
    const nbar = Math.max(1e-3, 1 - curv);
    let rise = 0;
    for (let k = 0; k < m; k++) { const i = ids[k]; const h = (S.x[i] - px) * ux + (S.y[i] - py) * uy + (S.z[i] - pz) * uz; if (h > rise) rise = h; }
    const lift = Math.min(rise, 0.5 * s0);               // the face rests on the patch's high point
    let [tx, ty, tz] = pa.dir; const tn = tx * ux + ty * uy + tz * uz;
    tx -= tn * ux; ty -= tn * uy; tz -= tn * uz; const tl = Math.hypot(tx, ty, tz) || 1;
    // skin binding: the sample nearest the patch mean, where the tile sits
    let best = ids[0], bd = Infinity;
    for (let k = 0; k < m; k++) { const i = ids[k], d = (S.x[i] - px) ** 2 + (S.y[i] - py) ** 2 + (S.z[i] - pz) ** 2; if (d < bd) { bd = d; best = i; } }
    // blendshapes: the patch's mean motion
    const slot = tiles.length;
    let morph = null;
    if (M) { morph = packMorph.subarray(slot * M * 3, (slot + 1) * M * 3);
      for (let k = 0; k < m; k++) { const o = ids[k] * M * 3, w = WA[ids[k]]; for (let j = 0; j < M * 3; j++) morph[j] += w * S.morph[o + j]; }
      for (let j = 0; j < M * 3; j++) morph[j] /= st.W; }
    const skinIdx = packIdx.subarray(slot * 4, slot * 4 + 4), skinWt = packWt.subarray(slot * 4, slot * 4 + 4);
    skinIdx.set(S.skinIdx.subarray(best * 4, best * 4 + 4)); skinWt.set(S.skinWt.subarray(best * 4, best * 4 + 4));
    const parts = {}; for (let k = 0; k < m; k++) parts[S.part[ids[k]]] = (parts[S.part[ids[k]]] || 0) + 1;
    tiles.push({
      x: px + ux * lift, y: py + uy * lift, z: pz + uz * lift, nx: ux, ny: uy, nz: uz,
      tx: tx / tl, ty: ty / tl, tz: tz / tl, contour: pa.contour, edge: pa.conf,
      s: s0, area: st.W * nbar, r: st.r, g: st.g, b: st.b, sr: st.sr, sg: st.sg, sb: st.sb,
      ro: toksvig(st.ro, nbar), me: st.me, sp: st.sp, imp: st.imp, curv,
      part: +Object.keys(parts).reduce((a, b) => parts[a] >= parts[b] ? a : b),
      skinIdx, skinWt, morph,
    });
  }
  ms.patches = clock() - t0;
  return { tiles, stats: { tiles: tiles.length, seeds: seeds.length, orphans: patches.orphans || 0, depths: depthCount, size, ms },
    buffers: [packIdx.buffer, packWt.buffer, ...(packMorph ? [packMorph.buffer] : [])] };
}

// Andamento: a direction field along the colour contours (structure-tensor
// minor axis, 4-fold diffusion), then L∞ relaxation under each tile's own
// square metric — after Hausner, "Simulating Decorative Mosaics" (2001).
function andamento(seeds, S, ox, oy, oz, size, A) {
  const N = seeds.length, n = S.count;
  const F = new Float64Array(N * 6);
  for (let k = 0; k < N; k++) courseFrame(seeds[k].nx, seeds[k].ny, seeds[k].nz, F, k * 6);
  const zr0 = new Float64Array(N), zi0 = new Float64Array(N), edge = new Float64Array(N * 2), conf = new Float64Array(N);
  const ch = [S.sr, S.sg, S.sb];
  for (let k = 0; k < N; k++) {
    const sd = seeds[k], ids = sd.ids, m = ids.length, o = k * 6;
    let Suu = 0, Suv = 0, Svv = 0; const Suc = [0, 0, 0], Svc = [0, 0, 0], mc = [0, 0, 0];
    for (let q = 0; q < m; q++) for (let c = 0; c < 3; c++) mc[c] += ch[c][ids[q]];
    for (let c = 0; c < 3; c++) mc[c] /= m;
    for (let q = 0; q < m; q++) {
      const i = ids[q], dx = S.x[i] - sd.x, dy = S.y[i] - sd.y, dz = S.z[i] - sd.z;
      const u = dx * F[o] + dy * F[o + 1] + dz * F[o + 2], v = dx * F[o + 3] + dy * F[o + 4] + dz * F[o + 5];
      Suu += u * u; Suv += u * v; Svv += v * v;
      for (let c = 0; c < 3; c++) { const d = ch[c][i] - mc[c]; Suc[c] += u * d; Svc[c] += v * d; }
    }
    const det = Suu * Svv - Suv * Suv; let Jxx = 0, Jxy = 0, Jyy = 0;
    if (m >= 4 && det > 1e-12 * (Suu + Svv) * (Suu + Svv)) for (let c = 0; c < 3; c++) {
      const gu = (Svv * Suc[c] - Suv * Svc[c]) / det, gv = (Suu * Svc[c] - Suv * Suc[c]) / det;
      Jxx += gu * gu; Jxy += gu * gv; Jyy += gv * gv;
    }
    conf[k] = Math.min(1, Math.sqrt(Math.sqrt((Jxx - Jyy) ** 2 + 4 * Jxy * Jxy)) * sd.s * A.edgeGain);
    const th = 0.5 * Math.atan2(2 * Jxy, Jxx - Jyy) + Math.PI / 2;   // along the contour
    edge[k * 2] = Math.cos(th); edge[k * 2 + 1] = Math.sin(th);
    zr0[k] = conf[k] * Math.cos(4 * th) + A.course; zi0[k] = conf[k] * Math.sin(4 * th);
  }
  // Neighbours, from one hash per octree depth with cells the size of that
  // depth's tiles: a pair is found from its smaller tile's side, in the
  // bigger one's hash, so no lookup wades through cells keyed to another
  // size (one grid keyed to the median made each large tile span hundreds
  // of cells, and fine layings took seconds). near: centres within
  // 0.75·(sa + sb) and facing alike — the direction field's neighbours;
  // cand: within sa + sb — the tiles that may claim a seed's samples.
  const grids = new Map();
  for (let k = 0; k < N; k++) { const sd = seeds[k]; let g = grids.get(sd.d);
    if (!g) grids.set(sd.d, g = { s: sd.s, grid: pointGrid(sd.s, ox, oy, oz, size) }); g.grid.put(k, sd.x, sd.y, sd.z); }
  const near = Array.from({ length: N }, () => []), cand = Array.from({ length: N }, () => []);
  for (let k = 0; k < N; k++) {
    const a = seeds[k];
    for (const [d, { s, grid }] of grids) {
      if (d > a.d) continue;                              // only equal or larger tiles
      grid.visit(a.x, a.y, a.z, a.s + s, (j) => {
        if (d === a.d && j <= k) return;                  // equal sizes: each pair once
        const b = seeds[j], r = a.s + b.s, d2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
        if (d2 > r * r) return;
        cand[k].push(j); cand[j].push(k);
        if (d2 <= 0.5625 * r * r && a.nx * b.nx + a.ny * b.ny + a.nz * b.nz >= 0.3) { near[k].push(j); near[j].push(k); }
      });
    }
  }
  const nbr = near;
  let zr = Float64Array.from(zr0), zi = Float64Array.from(zi0), nzr = new Float64Array(N), nzi = new Float64Array(N);
  const dir = new Float64Array(N * 3);
  const toWorld = (k) => {
    const th = Math.atan2(zi[k], zr[k]) / 4, c = Math.cos(th), s = Math.sin(th), o = k * 6;
    dir[k * 3] = c * F[o] + s * F[o + 3]; dir[k * 3 + 1] = c * F[o + 1] + s * F[o + 4]; dir[k * 3 + 2] = c * F[o + 2] + s * F[o + 5];
  };
  for (let it = 0; it < A.smooth; it++) {
    for (let k = 0; k < N; k++) toWorld(k);
    for (let k = 0; k < N; k++) {
      const list = nbr[k], o = k * 6; let ar = 0, ai = 0;
      for (const j of list) {
        // the neighbour's direction in this tile's frame, as (u + iv)⁴ / |u + iv|⁴:
        // its 4-fold angle without a single trig call
        const u = dir[j * 3] * F[o] + dir[j * 3 + 1] * F[o + 1] + dir[j * 3 + 2] * F[o + 2];
        const v = dir[j * 3] * F[o + 3] + dir[j * 3 + 1] * F[o + 4] + dir[j * 3 + 2] * F[o + 5];
        const q = u * u + v * v; if (q < 1e-24) continue;
        const a = u * u - v * v, b = 2 * u * v, w = Math.hypot(zr[j], zi[j]) / (q * q);
        ar += w * (a * a - b * b); ai += w * 2 * a * b;
      }
      const d = list.length || 1;
      nzr[k] = zr0[k] + A.spread * ar / d; nzi[k] = zi0[k] + A.spread * ai / d;
    }
    [zr, nzr] = [nzr, zr]; [zi, nzi] = [nzi, zi];
  }
  for (let k = 0; k < N; k++) toWorld(k);
  const C = new Float64Array(N * 3), Nn = new Float64Array(N * 3), D = new Float64Array(N * 3), half = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    const sd = seeds[k]; C[k * 3] = sd.x; C[k * 3 + 1] = sd.y; C[k * 3 + 2] = sd.z;
    Nn[k * 3] = sd.nx; Nn[k * 3 + 1] = sd.ny; Nn[k * 3 + 2] = sd.nz; half[k] = sd.s / 2;
    D[k * 3] = dir[k * 3]; D[k * 3 + 1] = dir[k * 3 + 1]; D[k * 3 + 2] = dir[k * 3 + 2];
  }
  // L∞ relaxation. A sample may be claimed by the tile its octree cell seeded
  // or by that tile's candidates; tiles move by a fraction of their size.
  const seedOf = new Int32Array(n);
  for (let k = 0; k < N; k++) for (const i of seeds[k].ids) seedOf[i] = k;
  const start = new Int32Array(N + 1);
  for (let k = 0; k < N; k++) start[k + 1] = start[k] + 1 + cand[k].length;
  const flat = new Int32Array(start[N]);                 // each seed's own tile first, then its candidates
  for (let k = 0; k < N; k++) { flat[start[k]] = k; flat.set(cand[k], start[k] + 1); }
  const X = S.x, Y = S.y, Z = S.z, NX = S.nx, NY = S.ny, NZ = S.nz, facing = A.facing, depthW = A.depth;
  const owner = new Int32Array(n).fill(-1), cnt = new Int32Array(N), acc = new Float64Array(N * 6);
  const B = new Float64Array(N * 3), inv = new Float64Array(N);
  for (let round = 0; round <= A.rounds; round++) {
    for (let k = 0; k < N; k++) {
      const k3 = k * 3, nx = Nn[k3], ny = Nn[k3 + 1], nz = Nn[k3 + 2], tx = D[k3], ty = D[k3 + 1], tz = D[k3 + 2];
      B[k3] = ny * tz - nz * ty; B[k3 + 1] = nz * tx - nx * tz; B[k3 + 2] = nx * ty - ny * tx;
      inv[k] = half[k] > 0 ? 1 / half[k] : 0;              // 0: claimed by its neighbours
    }
    for (let i = 0; i < n; i++) {
      const x = X[i], y = Y[i], z = Z[i], sx = NX[i], sy = NY[i], sz = NZ[i], k0 = seedOf[i], e = start[k0 + 1];
      let best = -1, bd = Infinity;
      for (let c = start[k0]; c < e; c++) {
        const k = flat[c], ik = inv[k]; if (ik === 0) continue;
        const k3 = k * 3, nx = Nn[k3], ny = Nn[k3 + 1], nz = Nn[k3 + 2];
        if (sx * nx + sy * ny + sz * nz < facing) continue;             // the far side of a thin part
        const dx = x - C[k3], dy = y - C[k3 + 1], dz = z - C[k3 + 2];
        const u = Math.abs(dx * D[k3] + dy * D[k3 + 1] + dz * D[k3 + 2]);
        const v = Math.abs(dx * B[k3] + dy * B[k3 + 1] + dz * B[k3 + 2]);
        const w = Math.abs(dx * nx + dy * ny + dz * nz);
        const d = ((u > v ? u : v) + depthW * w) * ik;
        if (d < bd) { bd = d; best = k; }
      }
      owner[i] = best;
    }
    if (round === A.rounds) break;
    acc.fill(0); cnt.fill(0);
    for (let i = 0; i < n; i++) { const k = owner[i]; if (k < 0) continue; cnt[k]++; const o = k * 6;
      acc[o] += S.x[i]; acc[o + 1] += S.y[i]; acc[o + 2] += S.z[i]; acc[o + 3] += S.nx[i]; acc[o + 4] += S.ny[i]; acc[o + 5] += S.nz[i]; }
    for (let k = 0; k < N; k++) {
      if (!cnt[k]) { half[k] = 0; continue; }       // claimed by its neighbours
      const o = k * 6, k3 = k * 3;
      C[k3] = acc[o] / cnt[k]; C[k3 + 1] = acc[o + 1] / cnt[k]; C[k3 + 2] = acc[o + 2] / cnt[k];
      let nx = acc[o + 3], ny = acc[o + 4], nz = acc[o + 5]; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      Nn[k3] = nx; Nn[k3 + 1] = ny; Nn[k3 + 2] = nz;
      let tx = D[k3], ty = D[k3 + 1], tz = D[k3 + 2]; const dn = tx * nx + ty * ny + tz * nz;
      tx -= dn * nx; ty -= dn * ny; tz -= dn * nz; const tl = Math.hypot(tx, ty, tz);
      if (tl > 1e-6) { D[k3] = tx / tl; D[k3 + 1] = ty / tl; D[k3 + 2] = tz / tl; }
      else { courseFrame(nx, ny, nz, F, k * 6); D[k3] = F[k * 6]; D[k3 + 1] = F[k * 6 + 1]; D[k3 + 2] = F[k * 6 + 2]; }
    }
  }
  const out = new Array(N); cnt.fill(0);
  for (let i = 0; i < n; i++) if (owner[i] >= 0) cnt[owner[i]]++;
  for (let k = 0; k < N; k++) {
    if (!cnt[k]) { out[k] = null; continue; }
    const o = k * 6, ec = edge[k * 2], es = edge[k * 2 + 1];
    out[k] = { ids: new Int32Array(cnt[k]), fill: 0, dir: [D[k * 3], D[k * 3 + 1], D[k * 3 + 2]], conf: conf[k],
      contour: [ec * F[o] + es * F[o + 3], ec * F[o + 1] + es * F[o + 4], ec * F[o + 2] + es * F[o + 5]] };
  }
  let orphans = 0;
  for (let i = 0; i < n; i++) { const k = owner[i]; if (k >= 0) { const r = out[k]; r.ids[r.fill++] = i; } else orphans++; }
  out.orphans = orphans;
  return out;
}

// ═══ VISIBILITY ══════════════════════════════════════════════════════════
// three's RGBADepthPacking (packDepthToRGBA), undone; an orthographic depth
// is linear, so it maps straight back to distance
const UNPACK = [255 / 256 / (256 * 256 * 256), 255 / 256 / (256 * 256), 255 / 256 / 256, 255 / 256];

/**
 * Which of the surface can be seen at all? A surface inside another — a neck
 * tube running up into the head, an ear's root, skin behind an eyeball — is
 * hidden in the original's render by its depth buffer, pixel by pixel. Laid
 * as tesserae it isn't: its tiles, millimetres across, poke through whatever
 * covers it. So the kit only lays tiles on surface some view can see: the
 * depth of every part (and of `occluders`, e.g. eyes and teeth that aren't
 * tiled) is rendered from 26 directions around them — cube faces, edges and
 * corners, so every normal is within ~25° of one — and a vertex counts as
 * seen when a view that faces it (within 45°) finds it frontmost.
 * parts / occluders: { positions, index?, normals? }, all in one space.
 * Returns one Float32Array per part: 1 seen, 0 hidden. Browser only.
 */
export function visibleVertices(THREE, renderer, parts, { occluders = [], res = 512 } = {}) {
  const scene = new THREE.Scene(), box = new THREE.Box3(), geos = [];
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  for (const p of [...parts, ...occluders]) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p.positions, 3));
    if (p.index) g.setIndex(new THREE.BufferAttribute(p.index, 1));
    g.computeBoundingBox(); box.union(g.boundingBox); geos.push(g);
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; scene.add(m);
  }
  const c = box.getCenter(new THREE.Vector3()), R = box.getSize(new THREE.Vector3()).length() / 2 || 1;
  const pix = 2 * R / res, tol = 1.5 * pix;          // a pixel's depth spread at 45°, and a half more
  const cam = new THREE.OrthographicCamera(-R, R, R, -R, R, 3 * R);
  const rt = new THREE.WebGLRenderTarget(res, res), px = new Uint8Array(res * res * 4);
  const seen = parts.map((p) => new Float32Array(p.positions.length / 3));
  const prev = { target: renderer.getRenderTarget(), color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha() };
  const r = new THREE.Vector3(), u = new THREE.Vector3(), d = new THREE.Vector3();
  try {
    renderer.setClearColor(0x000000, 0);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let e = -1; e <= 1; e++) {
      if (!a && !b && !e) continue;
      d.set(a, b, e).normalize();                     // toward the camera
      cam.position.copy(c).addScaledVector(d, 2 * R);
      cam.up.set(0, 1, 0); if (Math.abs(d.y) > 0.9) cam.up.set(0, 0, 1);
      cam.lookAt(c); cam.updateMatrixWorld();
      r.setFromMatrixColumn(cam.matrixWorld, 0); u.setFromMatrixColumn(cam.matrixWorld, 1);
      renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, res, res, px);
      parts.forEach((p, k) => {
        const P = p.positions, N = p.normals, S = seen[k];
        for (let i = 0; i < S.length; i++) {
          if (S[i]) continue;
          if (N && N[i * 3] * d.x + N[i * 3 + 1] * d.y + N[i * 3 + 2] * d.z < 0.7) continue;   // not facing this view
          const x = P[i * 3] - c.x, y = P[i * 3 + 1] - c.y, z = P[i * 3 + 2] - c.z;
          const ix = Math.floor(((x * r.x + y * r.y + z * r.z) / R + 1) / 2 * res), iy = Math.floor(((x * u.x + y * u.y + z * u.z) / R + 1) / 2 * res);
          if (ix < 0 || iy < 0 || ix >= res || iy >= res) continue;
          const o = (iy * res + ix) * 4;
          const z01 = (px[o] * UNPACK[0] + px[o + 1] * UNPACK[1] + px[o + 2] * UNPACK[2] + px[o + 3] * UNPACK[3]) / 255;
          // nothing drawn there (a silhouette edge): seen; else frontmost within tolerance
          if (!(z01 > 0) || 2 * R - (x * d.x + y * d.y + z * d.z) <= R + z01 * 2 * R + tol) S[i] = 1;
        }
      });
    }
  } finally {
    renderer.setRenderTarget(prev.target); renderer.setClearColor(prev.color, prev.alpha);
    rt.dispose(); mat.dispose(); for (const g of geos) g.dispose();
  }
  return seen;
}

// ═══ OFF THE MAIN THREAD ═════════════════════════════════════════════════
/**
 * Surfaces → tiles in one call: { parts, count, sample: sampleSurfaces'
 * options, lay: layTesserae's } → { tiles, stats, samples, buffers }.
 */
export function laySurfaces({ parts, count, sample = {}, lay = {} }) {
  const t0 = globalThis.performance.now();
  const S = sampleSurfaces(parts, count, sample);
  const t1 = globalThis.performance.now();
  const out = layTesserae(S, lay);
  if (out.stats.ms) out.stats.ms.sample = t1 - t0;
  return { ...out, samples: S.count };
}

/**
 * A head takes the better part of a second to lay — long enough to stall a
 * live avatar. createLayer() runs laySurfaces in a module worker
 * (tessera-worker.js, beside this file) and resolves with its result; the
 * page keeps drawing meanwhile. Where a module worker can't start, it lays
 * on the calling thread instead, so the result never depends on the host.
 */
export function createLayer(url = new URL('./tessera-worker.js', import.meta.url)) {
  let worker = null, broken = typeof Worker === 'undefined', next = 0;
  const pending = new Map();
  const here = (req) => new Promise((resolve) => setTimeout(resolve, 0)).then(() => laySurfaces(req));
  const fail = () => {
    broken = true; if (worker) worker.terminate(); worker = null;
    for (const p of pending.values()) here(p.req).then(p.resolve, p.reject);
    pending.clear();
  };
  function start() {
    if (worker || broken) return worker;
    try {
      worker = new Worker(url, { type: 'module' });
      worker.onmessage = ({ data }) => {
        const p = pending.get(data.id); if (!p) return; pending.delete(data.id);
        if (data.error) p.reject(new Error(data.error)); else p.resolve(data.result);
      };
      worker.onerror = (e) => { e.preventDefault?.(); fail(); };    // it never loaded: lay here instead
    } catch { broken = true; worker = null; }
    return worker;
  }
  return {
    lay(req) {
      if (!start()) return here(req);
      const id = ++next;
      return new Promise((resolve, reject) => { pending.set(id, { req, resolve, reject }); worker.postMessage({ id, req }); });
    },
    get threaded() { return !!worker && !broken; },
    dispose() { if (worker) worker.terminate(); worker = null; pending.clear(); },
  };
}

// ═══ 3. PAINT ════════════════════════════════════════════════════════════
export const SPLITS = { classic: 0.05, bold: 0.14, extreme: 0.24 };
export const GLYPH = { metal: 0, skin: 1, cloth: 2, hair: 3 };

/** Which glyph set reads as this tile's material (from its sRGB mean). */
export function glyphOf(t) {
  if (t.me > 0.5) return GLYPH.metal;
  const [h, s, l] = rgbToHsl(t.sr, t.sg, t.sb);
  if (l < 0.2) return GLYPH.hair;
  if (s > 0.34 && h > 0.07 && h < 0.19) return GLYPH.metal;
  if (h < 0.11 && s > 0.1 && s < 0.5 && l > 0.42) return GLYPH.skin;
  return GLYPH.cloth;
}

/**
 * Divisionism, solved: the face shows two pure hues bracketing the target
 * (equiluminant with it, so the play is chroma, never value) plus a base
 * solved in linear light so the coverage-weighted mix IS the target.
 * target: linear rgb; cov: {a, b, base} of the tile's glyph. Returns
 * [base, accentA, accentB], each linear rgb.
 */
export function decomposePure(target, cov, split = SPLITS.bold) {
  const [h, s, l] = rgbToHsl(linearToSrgb(target[0]), linearToSrgb(target[1]), linearToSrgb(target[2]));
  const gray = s < 0.1, sat = gray ? 0.4 : Math.max(0.88, s), la = Math.min(0.9, Math.max(0.08, l));
  const lin = (c) => c.map(srgbToLinear);
  const Y = luminance(...target);
  const A = equiluminant(...lin(hslToRgb(gray ? 0.08 : h + 1 - split, sat, la)), Y);
  const B = equiluminant(...lin(hslToRgb(gray ? 0.58 : h + split, sat, la)), Y);
  for (let t = 0; t <= 1.001; t += 0.25) {
    const a = A.map((v, c) => v + (target[c] - v) * t), b = B.map((v, c) => v + (target[c] - v) * t);
    const base = [0, 1, 2].map((c) => (target[c] - cov.a * a[c] - cov.b * b[c]) / cov.base);
    if ((Math.min(...base) >= -0.001 && Math.max(...base) <= 1.001) || t >= 1)
      return [base.map((v) => Math.min(1, Math.max(0, v))), a, b];
  }
}

/** Glyph masks (R = accent A, G = accent B), one texture-array layer per material. Browser only. */
export function makeGlyphs(THREE) {
  const S = 128, N = 4, cv = document.createElement('canvas'); cv.width = S * N; cv.height = S;
  const g = cv.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#000'; g.fillRect(0, 0, S * N, S);
  const A = '#ff0000', B = '#00ff00';
  g.fillStyle = A;   // 0 metal: hammered facets + glints
  for (const [x1, y1, x2, y2, x3, y3] of [[4, 44, 54, 6, 68, 54], [62, 2, 118, 26, 86, 60], [2, 66, 52, 80, 20, 124], [68, 72, 124, 62, 96, 120],
    [30, 6, 60, 34, 8, 40], [92, 30, 126, 10, 126, 60], [36, 86, 66, 116, 10, 118], [82, 66, 120, 66, 110, 110]]) {
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.closePath(); g.fill(); }
  g.fillStyle = B; for (const [x, y, r] of [[38, 28, 7], [94, 46, 8], [50, 98, 7], [102, 92, 7], [16, 10, 5], [120, 116, 6]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  g.save(); g.translate(S, 0);   // 1 skin: pores + freckles
  g.fillStyle = A; for (const [x, y, r] of [[16, 18, 9], [46, 10, 8], [76, 16, 9], [106, 10, 8], [124, 40, 8], [8, 46, 8], [32, 44, 9], [60, 40, 8], [90, 44, 9], [118, 68, 8],
    [14, 74, 8], [42, 72, 9], [70, 70, 8], [98, 76, 9], [20, 102, 8], [50, 104, 9], [80, 102, 8], [110, 106, 9], [36, 124, 7], [92, 124, 8]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  g.fillStyle = B; for (const [x, y, r] of [[30, 30, 4], [62, 58, 4.5], [96, 26, 4], [112, 90, 4.5], [18, 90, 4], [70, 110, 4.5], [100, 60, 4]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  g.restore(); g.save(); g.translate(S * 2, 0);   // 2 cloth: warp + weft
  g.fillStyle = A; for (let x = 4; x < S; x += 20) g.fillRect(x, 0, 10, S);
  g.fillStyle = B; for (let y = 8; y < S; y += 22) g.fillRect(0, y, S, 10);
  g.restore(); g.save(); g.translate(S * 3, 0);   // 3 hair: strands + fine strands
  for (const [c, w, ph] of [[A, 8, 0], [B, 4, 12]]) { g.strokeStyle = c; g.lineWidth = w;
    for (let x = 6 + ph; x < S; x += 18) { g.beginPath(); g.moveTo(x, -4); for (let y = 0; y <= S; y += 16) g.lineTo(x + Math.sin(y * 0.09 + x) * 6, y); g.stroke(); } }
  g.restore();
  const data = new Uint8Array(S * S * 4 * N), coverage = [];
  for (let p = 0; p < N; p++) {
    const d = g.getImageData(p * S, 0, S, S).data; data.set(d, p * S * S * 4);
    let a = 0, b = 0; for (let i = 0; i < d.length; i += 4) { a += d[i]; b += d[i + 1]; }
    a /= 255 * S * S; b /= 255 * S * S; coverage.push({ a, b, base: Math.max(0.08, 1 - a - b) });
  }
  const tex = new THREE.DataArrayTexture(data, S, S, N);
  tex.colorSpace = THREE.NoColorSpace; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.anisotropy = 4;
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true; tex.needsUpdate = true;
  return { texture: tex, coverage };
}

// ═══ 4. MESHES ═══════════════════════════════════════════════════════════
// face area of each unit shape (rounded corners taken off)
export const SHAPE_AREA = [1 - (4 - Math.PI) * 0.09 * 0.09, 0.42 * 1.3 - (4 - Math.PI) * 0.07 * 0.07, 0.75 * Math.sqrt(3) * 0.62 * 0.62];
export function shapeOf(t, laying = LAYING) {
  return t.curv > laying.curvForce ? 2 : t.imp > laying.subThreshold * 1.3 ? 1 : 0;
}

/**
 * Tiles → instanced meshes (one per shape) sharing one tile material, plus a
 * TileDriver that poses them. opts: { RoundedBoxGeometry, inset (face share
 * of the patch, linear), bedTint, paint ('flat' | 'pure'), split, glyphs
 * (makeGlyphs(), for 'pure'), glyphOf }. Colours are LINEAR — pages that
 * disable THREE.ColorManagement hand in the values their shaders already use.
 */
export function buildTileMeshes(THREE, tiles, opts = {}) {
  const { RoundedBoxGeometry, inset = 0.9, bedTint = 0.5, paint = 'flat', split = SPLITS.bold, glyphs = null, pickGlyph = glyphOf } = opts;
  const shapes = [
    () => new RoundedBoxGeometry(1, 1, 0.5, 2, 0.09),
    () => new RoundedBoxGeometry(0.42, 1.3, 0.42, 2, 0.07),
    () => new THREE.CylinderGeometry(0.62, 0.62, 0.5, 3).rotateX(Math.PI / 2),
  ];
  const pure = paint === 'pure' && glyphs;
  const material = tileMaterial(THREE, { pure, glyphs });
  const cover = inset * inset, buckets = [[], [], []];
  tiles.forEach((t, i) => buckets[shapeOf(t)].push(i));
  const meshes = [], bindings = [];
  buckets.forEach((ids, shape) => {
    if (!ids.length) return;
    const n = ids.length, geo = shapes[shape]();
    const mesh = new THREE.InstancedMesh(geo, material, n);
    mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const col = new Float32Array(n * 3), surf = new Float32Array(n * 3), bed = new Float32Array(n * 3);
    const aA = pure ? new Float32Array(n * 3) : null, aB = pure ? new Float32Array(n * 3) : null, aP = pure ? new Float32Array(n) : null;
    const q = new Float32Array(n * 4), sc = new Float32Array(n * 3), base = new Float32Array(n * 3);
    const depth = shape === 1 ? 0.42 : 0.5;          // unit-shape thickness
    ids.forEach((ti, j) => {
      const t = tiles[ti];
      // the face covers inset² of its projected patch; it pays back what its joint doesn't send
      const side = Math.min(inset * Math.sqrt(t.area / SHAPE_AREA[shape]), 1.5 * t.s);
      // a tessera is about half as thick as it is wide, whatever its size — a
      // body sized by its octree cell turned small faces into matchsticks —
      // and it sinks half that thickness below its face
      sc[j * 3] = side; sc[j * 3 + 1] = side; sc[j * 3 + 2] = side;
      const sink = 0.5 * depth * side;
      base[j * 3] = t.x - t.nx * sink; base[j * 3 + 1] = t.y - t.ny * sink; base[j * 3 + 2] = t.z - t.nz * sink;
      const target = [compensate(t.r, cover, bedTint), compensate(t.g, cover, bedTint), compensate(t.b, cover, bedTint)];
      if (pure) {
        const gl = pickGlyph(t), [base, a, b] = decomposePure(target, glyphs.coverage[gl], split);
        col.set(base, j * 3); aA.set(a, j * 3); aB.set(b, j * 3); aP[j] = gl;
      } else {
        // hand-cut: a slight, fixed lightness jitter so runs of one colour read as tiles
        const [h, s, l] = rgbToHsl(...target.map(linearToSrgb));
        col.set(hslToRgb(h, s, l + (hash01(ti, 0x1a77e5) - 0.5) * 0.07).map(srgbToLinear), j * 3);
      }
      surf[j * 3] = t.ro; surf[j * 3 + 1] = t.me; surf[j * 3 + 2] = t.sp ?? 1;
      bed[j * 3] = t.r * bedTint; bed[j * 3 + 1] = t.g * bedTint; bed[j * 3 + 2] = t.b * bedTint;
      q.set(tileQuat(t, shape, j), j * 4);
    });
    mesh.instanceColor = new THREE.InstancedBufferAttribute(col, 3);
    geo.setAttribute('aSurf', new THREE.InstancedBufferAttribute(surf, 3));
    geo.setAttribute('aBed', new THREE.InstancedBufferAttribute(bed, 3));
    if (pure) { geo.setAttribute('aA', new THREE.InstancedBufferAttribute(aA, 3));
      geo.setAttribute('aB', new THREE.InstancedBufferAttribute(aB, 3));
      geo.setAttribute('aP', new THREE.InstancedBufferAttribute(aP, 1)); }
    meshes.push(mesh); bindings.push({ mesh, ids, q, scale: sc, base });
  });
  const driver = new TileDriver(tiles, bindings);
  driver.update();                                    // bind pose
  return {
    meshes, material, driver, tiles,
    dispose() { for (const m of meshes) { m.geometry.dispose(); m.dispose && m.dispose(); } material.dispose(); },
  };
}

// the tile's frame: face along the normal, sides along its course; a sliver's
// long axis follows the contour itself; wedges keep a scattered roll
function tileQuat(t, shape, j) {
  const n = [t.nx, t.ny, t.nz]; let u = [t.tx, t.ty, t.tz];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  let X, Y;
  if (shape === 1) {
    const alt = cross(n, u), c = t.contour;
    if (c && Math.abs(alt[0] * c[0] + alt[1] * c[1] + alt[2] * c[2]) > Math.abs(u[0] * c[0] + u[1] * c[1] + u[2] * c[2])) u = alt;
    X = cross(u, n); Y = u;
  } else { X = u; Y = cross(n, u); }
  let q = quatFromBasis(X, Y, n);
  if (shape === 2) q = quatMul(quatAxisAngle(n, (j * 2.399963) % (Math.PI * 2)), q);
  return q;
}
function quatFromBasis(X, Y, Z) {   // columns X, Y, Z → quaternion (x, y, z, w)
  const m00 = X[0], m01 = Y[0], m02 = Z[0], m10 = X[1], m11 = Y[1], m12 = Z[1], m20 = X[2], m21 = Y[2], m22 = Z[2];
  const tr = m00 + m11 + m22;
  if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); return [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s]; }
  if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); return [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
  if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); return [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]; }
  const s = 2 * Math.sqrt(1 + m22 - m00 - m11); return [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
}
const quatAxisAngle = (a, ang) => { const s = Math.sin(ang / 2); return [a[0] * s, a[1] * s, a[2] * s, Math.cos(ang / 2)]; };
const quatMul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];

/**
 * The tile shader: MeshStandardMaterial plus composed patches —
 *   surface  each tile answers light with its own roughness, metalness and
 *            specular (a dielectric's reflectance scale, as a
 *            MeshPhysicalMaterial's specularIntensity: F0 0.04·s, F90 s)
 *   paint    'pure': base + two accents through the glyph masks
 *   sides    side walls take the bed's colour, matte: a set tessera's sides
 *            are packed with mortar, and bare ones are lit surface the
 *            source never had
 */
export function tileMaterial(THREE, { pure = false, glyphs = null } = {}) {
  const m = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    let v = 'attribute vec3 aSurf; attribute vec3 aBed;\nvarying vec3 vSurf; varying vec3 vBedCol; varying float vTileNz;\n';
    let f = 'varying vec3 vSurf; varying vec3 vBedCol; varying float vTileNz;\n';
    let begin = ' vSurf = aSurf; vBedCol = aBed; vTileNz = normal.z;';
    let paintGl = '';
    if (pure) {
      sh.uniforms.patTex = { value: glyphs.texture };
      v += 'attribute vec3 aA; attribute vec3 aB; attribute float aP;\nvarying vec3 vAcc1; varying vec3 vAcc2; varying vec3 vPUv;\n';
      f += 'uniform sampler2DArray patTex;\nvarying vec3 vAcc1; varying vec3 vAcc2; varying vec3 vPUv;\n';
      begin += ' vAcc1 = aA; vAcc2 = aB; vPUv = vec3(uv, aP);';
      paintGl = '\n vec4 pm = texture(patTex, vPUv);\n diffuseColor.rgb = diffuseColor.rgb * max(0.0, 1.0 - pm.r - pm.g) + vAcc1 * pm.r + vAcc2 * pm.g;';
    }
    sh.vertexShader = v + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + begin);
    sh.fragmentShader = f + sh.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>' + paintGl)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vSurf.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vSurf.y;')
      .replace('#include <normal_fragment_begin>',
        'float tileSide = 1.0 - smoothstep(0.3, 0.6, vTileNz);\n' +
        ' diffuseColor.rgb = mix(diffuseColor.rgb, vBedCol, tileSide);\n' +
        ' roughnessFactor = mix(roughnessFactor, 1.0, tileSide); metalnessFactor = mix(metalnessFactor, 0.0, tileSide);\n' +
        '#include <normal_fragment_begin>')
      .replace('#include <lights_physical_fragment>',
        '#include <lights_physical_fragment>\n' +
        ' material.specularColor = mix(vec3(0.04 * vSurf.z), diffuseColor.rgb, metalnessFactor);\n' +
        ' material.specularF90 = mix(vSurf.z, 1.0, metalnessFactor);');
  };
  const key = 'tessera-kit:' + (pure ? 'pure' : 'flat');
  m.customProgramCacheKey = () => key;
  return m;
}

/**
 * The setting bed: the source surface itself, drawn a little below the tile
 * faces (pushed in along its normal in view space, so the depth is in world
 * units on any rig), matte, its colour darkened to `tint`. Works on skinned
 * and morphing meshes — three's own chunks do the deforming. depth: a shared
 * { value } uniform, in world units.
 */
export function bedMaterial(THREE, { vertexColors = false, color = 0xffffff, tint = 0.5, depth, side = THREE.FrontSide } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors, roughness: 1, metalness: 0, side });
  m.color.set(color).multiplyScalar(tint);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBedDepth = depth;
    sh.vertexShader = 'uniform float uBedDepth;\n' + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n mvPosition.xyz -= normalize(transformedNormal) * uBedDepth;\n gl_Position = projectionMatrix * mvPosition;');
  };
  m.customProgramCacheKey = () => 'tessera-kit-bed';
  return m;
}

// ═══ 5. DRIVING ══════════════════════════════════════════════════════════
/**
 * Poses every tile from the rig, the way the GPU poses the surface it stands
 * for: its bind position plus its patch's mean blendshape motion, skinned by
 * its bones (Σ w·B·p), and its bind orientation turned by the weighted blend
 * of those bones' rotations.
 *   update(boneMats, boneQuats, influences)
 *     boneMats   Float32Array(16·B), column-major, each bone's
 *                bind-space → world transform (matrixWorld · boneInverse)
 *     boneQuats  Float32Array(4·B), the rotation part of each
 *     influences blendshape weights, same order as the samples' morphs
 * With no arguments, tiles sit at their bind pose. A binding is
 * { mesh, ids (tile indices), q (bind quaternions), scale, base (bind-space
 * body centres) }, 4, 3 and 3 floats per tile.
 */
export class TileDriver {
  constructor(tiles, bindings) { this.tiles = tiles; this.bindings = bindings; }
  update(boneMats = null, boneQuats = null, influences = null) {
    for (const { mesh, ids, q, scale, base } of this.bindings) {
      const E = mesh.instanceMatrix.array;
      for (let j = 0; j < ids.length; j++) {
        const t = this.tiles[ids[j]];
        let px = base[j * 3], py = base[j * 3 + 1], pz = base[j * 3 + 2];
        if (influences && t.morph) {
          const D = t.morph, K = Math.min(influences.length, D.length / 3);
          for (let k = 0; k < K; k++) { const w = influences[k]; if (w) { px += w * D[k * 3]; py += w * D[k * 3 + 1]; pz += w * D[k * 3 + 2]; } }
        }
        let qx = q[j * 4], qy = q[j * 4 + 1], qz = q[j * 4 + 2], qw = q[j * 4 + 3];
        if (boneMats) {
          let ax = 0, ay = 0, az = 0, bx = 0, by = 0, bz = 0, bw = 0, rx = 0, ry = 0, rz = 0, rw = 0, have = false;
          for (let k = 0; k < 4; k++) {
            const w = t.skinWt[k]; if (!w) continue;
            const b = t.skinIdx[k], o = b * 16, M = boneMats;
            ax += w * (M[o] * px + M[o + 4] * py + M[o + 8] * pz + M[o + 12]);
            ay += w * (M[o + 1] * px + M[o + 5] * py + M[o + 9] * pz + M[o + 13]);
            az += w * (M[o + 2] * px + M[o + 6] * py + M[o + 10] * pz + M[o + 14]);
            let cx = boneQuats[b * 4], cy = boneQuats[b * 4 + 1], cz = boneQuats[b * 4 + 2], cw = boneQuats[b * 4 + 3];
            if (!have) { rx = cx; ry = cy; rz = cz; rw = cw; have = true; }
            else if (cx * rx + cy * ry + cz * rz + cw * rw < 0) { cx = -cx; cy = -cy; cz = -cz; cw = -cw; }   // same hemisphere
            bx += w * cx; by += w * cy; bz += w * cz; bw += w * cw;
          }
          px = ax; py = ay; pz = az;
          const bl = Math.hypot(bx, by, bz, bw) || 1; bx /= bl; by /= bl; bz /= bl; bw /= bl;
          const x = bw * qx + bx * qw + by * qz - bz * qy, y = bw * qy - bx * qz + by * qw + bz * qx;
          const z = bw * qz + bx * qy - by * qx + bz * qw, w = bw * qw - bx * qx - by * qy - bz * qz;
          qx = x; qy = y; qz = z; qw = w;
        }
        const sx = scale[j * 3], sy = scale[j * 3 + 1], sz = scale[j * 3 + 2], o = j * 16;
        const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz, xx = qx * x2, xy = qx * y2, xz = qx * z2, yy = qy * y2, yz = qy * z2, zz = qz * z2, wx = qw * x2, wy = qw * y2, wz = qw * z2;
        E[o] = (1 - (yy + zz)) * sx; E[o + 1] = (xy + wz) * sx; E[o + 2] = (xz - wy) * sx; E[o + 3] = 0;
        E[o + 4] = (xy - wz) * sy; E[o + 5] = (1 - (xx + zz)) * sy; E[o + 6] = (yz + wx) * sy; E[o + 7] = 0;
        E[o + 8] = (xz + wy) * sz; E[o + 9] = (yz - wx) * sz; E[o + 10] = (1 - (xx + yy)) * sz; E[o + 11] = 0;
        E[o + 12] = px; E[o + 13] = py; E[o + 14] = pz; E[o + 15] = 1;
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
