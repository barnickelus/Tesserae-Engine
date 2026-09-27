/**
 * optics — the arithmetic that keeps a tessera honest to the eye.
 *
 * A tessera stands for a patch of surface. Close up it is an object in its
 * own right: a face, a course, a joint. Far enough away the eye can no longer
 * resolve it and receives only the light the patch sends, so whatever the
 * tile does up close, that light has to come out the same. These are the
 * rules that make it so. Each is implemented live in
 * examples/tessera-mosaic.html and was kept only because the eye model in
 * tools/optics-check.mjs measured it helping (docs/optical-language.md has
 * the numbers):
 *
 *   linearMean      a patch's colour is averaged in linear light, not sRGB
 *   toksvig         a flat face's roughness absorbs its patch's normal spread
 *   faceSide        a face covers a fixed share of its patch's projected area
 *   compensateFace  the face pays back the light its joint doesn't send
 *   equiluminant    paint accents share the face's luminance
 *   describePatch   …and the face rests on the patch's highest point
 *
 * Plain numbers and tuples only — no rendering-library dependency — so the
 * rules can be tested (tools/test/optics.test.mjs) and reused anywhere.
 */

export type RGB = [number, number, number];
export type Vec3 = [number, number, number];

// ---- light is additive in LINEAR units ----------------------------------

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** Relative luminance Y of a linear-light colour (Rec. 709 / sRGB primaries). */
export function luminance(c: RGB): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/**
 * The colour a patch sends, from sRGB-encoded samples: the LINEAR mean.
 * Averaging the encoded values darkens every mixed patch — half black, half
 * white averages to sRGB 0.5, which is 0.214 in light; the patch sends 0.5.
 */
export function linearMean(srgbSamples: ArrayLike<RGB>): RGB {
  const out: RGB = [0, 0, 0];
  const n = srgbSamples.length;
  if (!n) return out;
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) out[c] += srgbToLinear(srgbSamples[i][c]);
  return [out[0] / n, out[1] / n, out[2] / n];
}

// ---- gloss: a flat face stands in for a curved patch --------------------

/**
 * Toksvig's rule. A flat face has one normal; the patch it replaces had a
 * spread of them, and that spread is what made the patch's highlight broad.
 * Filtering normals loses variance, so the variance moves into roughness:
 * slope variance σ² ≈ (1 − |N̄|) / |N̄| from the mean unit normal's length,
 * and GGX α² grows by 2σ². (three.js's α is roughness², hence the 4th powers.)
 *
 * @param roughness       the patch's own mean roughness, 0..1
 * @param meanNormalLength |mean of the patch's unit normals|, 0..1
 */
export function toksvig(roughness: number, meanNormalLength: number): number {
  const nbar = Math.max(1e-3, Math.min(1, meanNormalLength));
  const sigma2 = (1 - nbar) / nbar;
  return Math.min(1, Math.pow(roughness ** 4 + 2 * sigma2, 0.25));
}

// ---- coverage: the face and its joint -----------------------------------

/**
 * Side length of a face that covers exactly `inset²` of its patch. The area
 * is the patch's area PROJECTED onto the face's plane (area · |N̄|): a flat
 * tile can only cover a curved patch's shadow along its normal. Sizing faces
 * by their octree cell instead made coverage swing with how the surface met
 * the grid (a plane crosses |nx|+|ny|+|nz| cells per cell-area).
 *
 * @param projectedArea  patch area · |N̄|
 * @param inset          the face's linear share, e.g. 0.9 for 'thin' grout
 * @param unitShapeArea  face area of the unit tile shape (1 for a square)
 */
export function faceSide(projectedArea: number, inset: number, unitShapeArea = 1): number {
  return inset * Math.sqrt(Math.max(0, projectedArea) / unitShapeArea);
}

/**
 * The face colour that keeps a patch's light: a face covering `coverage` of
 * its patch, beside a bed of albedo bedTint·S, must be
 *
 *     T = S · (1 − (1 − coverage)·bedTint) / coverage      (linear light)
 *
 * so that coverage·T + (1 − coverage)·bedTint·S = S. Clipped at 1: the
 * brightest whites can't be fully paid back.
 */
export function compensateFace(target: RGB, coverage: number, bedTint: number): RGB {
  const f = (1 - (1 - coverage) * bedTint) / coverage;
  return [Math.min(1, target[0] * f), Math.min(1, target[1] * f), Math.min(1, target[2] * f)];
}

/** What the eye receives from a face and its joint, unresolved (linear light). */
export function jointMix(face: RGB, bed: RGB, coverage: number): RGB {
  return [0, 1, 2].map((c) => coverage * face[c] + (1 - coverage) * bed[c]) as RGB;
}

// ---- paint: vibrate in colour, never in value ---------------------------

/**
 * Scale a colour to luminance Y; if that leaves the gamut, give up just
 * enough saturation (mix toward the grey of the same Y) to fit. Paint accents
 * made this way leave the face ONE luminance, so the divisionist play is pure
 * chroma: it can't break the light-and-shade the eye reads form from, and it
 * fuses at a shorter distance (the eye resolves luminance ~4× finer than
 * colour). HSL lightness is not luminance — a blue and a yellow of one HSL
 * lightness differ ~8× in Y.
 */
export function equiluminant(c: RGB, Y: number): RGB {
  const y0 = luminance(c);
  if (y0 <= 1e-6) return [Y, Y, Y];
  const s = Y / y0;
  let r = c[0] * s, g = c[1] * s, b = c[2] * s;
  let k = 0;
  for (const v of [r, g, b]) if (v > 1) k = Math.max(k, (v - 1) / (v - Y));
  r += (Y - r) * k; g += (Y - g) * k; b += (Y - b) * k;
  return [r, g, b];
}

// ---- the patch a tessera stands for -------------------------------------

export interface PatchSample {
  position: Vec3;
  /** Unit surface normal. */
  normal: Vec3;
  /** sRGB-encoded colour as photographed (0..1). */
  color: RGB;
  roughness: number;
  metalness: number;
}

export interface Patch {
  centroid: Vec3;
  /** Unit mean normal: the face's normal. */
  normal: Vec3;
  /** |mean of the unit normals| — 1 for a flat patch, → 0 as it wraps. */
  meanNormalLength: number;
  /** Linear-light mean colour. */
  color: RGB;
  roughness: number;
  metalness: number;
  /** Surface area of the patch. */
  area: number;
  /** Area projected onto the face's plane: area · meanNormalLength. */
  projectedArea: number;
  /** Height of the patch's highest point above its centroid plane, along the normal — where the face rests. */
  rise: number;
}

/**
 * Everything a tessera needs to know about its patch, from surface samples
 * drawn uniformly by area (`areaPerSample` each).
 */
export function describePatch(samples: ArrayLike<PatchSample>, areaPerSample: number): Patch {
  const n = samples.length;
  const c: Vec3 = [0, 0, 0], nsum: Vec3 = [0, 0, 0];
  let ro = 0, me = 0;
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    for (let k = 0; k < 3; k++) { c[k] += s.position[k]; nsum[k] += s.normal[k]; }
    ro += s.roughness; me += s.metalness;
  }
  for (let k = 0; k < 3; k++) c[k] /= n || 1;
  const len = Math.hypot(nsum[0], nsum[1], nsum[2]) || 1;
  const normal: Vec3 = [nsum[0] / len, nsum[1] / len, nsum[2] / len];
  const meanNormalLength = n ? len / n : 0;
  let rise = 0;
  for (let i = 0; i < n; i++) {
    const p = samples[i].position;
    const h = (p[0] - c[0]) * normal[0] + (p[1] - c[1]) * normal[1] + (p[2] - c[2]) * normal[2];
    if (h > rise) rise = h;
  }
  const colors: RGB[] = [];
  for (let i = 0; i < n; i++) colors.push(samples[i].color);
  const area = n * areaPerSample;
  return {
    centroid: c, normal, meanNormalLength, color: linearMean(colors),
    roughness: n ? ro / n : 1, metalness: n ? me / n : 0,
    area, projectedArea: area * meanNormalLength, rise,
  };
}
