/**
 * TesseraGenerator — convert surface samples into Tesserae.
 *
 *     surface samples  ->  [TesseraGenerator]  ->  Tessera[]
 *
 * Each sample becomes one Tessera: positioned at the sample, oriented so the
 * primitive's local +Z faces along the surface normal, and scaled by a base
 * size. Orientation-by-normal is what later lets face plates and materials read
 * as if they were applied to the surface itself.
 *
 * The generator is intentionally minimal for the first reconstruction
 * milestone: no animation, no face plates, no optical blending — just prove we
 * can turn a model into a coherent cloud of Tesserae.
 */

import type { Tessera } from '../core/Tessera';
import { PrimitiveType } from '../core/PrimitiveType';
import { MaterialType } from '../core/MaterialType';
import { SemanticClass } from '../core/SemanticClass';
import type { SurfaceSample } from './SurfaceSampler';

export interface GenerateOptions {
  /** Base edge length of each Tessera, in model units. */
  scale?: number;
  /** Random size variation in [0, 1]; 0 = uniform. Defaults to 0.2. */
  scaleJitter?: number;
  /** Base primitive shape. Defaults to PrimitiveType.Box. */
  primitiveType?: PrimitiveType;
  /** Material model. Defaults to MaterialType.Standard. */
  materialType?: MaterialType;
  /** Semantic label. Defaults to SemanticClass.Surface. */
  semanticClass?: SemanticClass;
  /** Deterministic RNG in [0, 1). Defaults to Math.random. */
  rng?: () => number;
}

type Vec3 = [number, number, number];
type Quat = [number, number, number, number];

/** Local axis the primitive is considered to "face" before orientation. */
const LOCAL_FORWARD: Vec3 = [0, 0, 1];

export function generateTesserae(samples: SurfaceSample[], options: GenerateOptions = {}): Tessera[] {
  const scale = options.scale ?? 1;
  const jitter = options.scaleJitter ?? 0.2;
  const primitiveType = options.primitiveType ?? PrimitiveType.Box;
  const materialType = options.materialType ?? MaterialType.Standard;
  const semanticClass = options.semanticClass ?? SemanticClass.Surface;
  const rng = options.rng ?? Math.random;

  const out: Tessera[] = new Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const sizeFactor = 1 - jitter + rng() * jitter * 2; // in [1 - jitter, 1 + jitter]
    const size = scale * sizeFactor;
    out[i] = {
      position: s.position.slice() as Vec3,
      rotation: quatFromUnitVectors(LOCAL_FORWARD, s.normal),
      scale: [size, size, size],
      primitiveType,
      materialType,
      semanticClass,
      importance: 1,
      curvature: 0,
      edgeStrength: 0,
    };
  }
  return out;
}

/**
 * Write Tessera transforms into a flat column-major mat4 buffer suitable for an
 * instanced-mesh matrix attribute (16 floats per Tessera).
 */
export function writeInstanceMatrices(tesserae: Tessera[], out?: Float32Array): Float32Array {
  const buf = out ?? new Float32Array(tesserae.length * 16);
  for (let i = 0; i < tesserae.length; i++) {
    composeMat4(tesserae[i].position, tesserae[i].rotation, tesserae[i].scale, buf, i * 16);
  }
  return buf;
}

/** Shortest-arc quaternion rotating unit vector `from` onto unit vector `to`. */
function quatFromUnitVectors(from: Vec3, to: Vec3): Quat {
  let r = from[0] * to[0] + from[1] * to[1] + from[2] * to[2] + 1;
  let x: number, y: number, z: number;
  if (r < 1e-6) {
    // Vectors are opposite — pick an arbitrary orthogonal axis.
    r = 0;
    if (Math.abs(from[0]) > Math.abs(from[2])) { x = -from[1]; y = from[0]; z = 0; }
    else { x = 0; y = -from[2]; z = from[1]; }
  } else {
    x = from[1] * to[2] - from[2] * to[1];
    y = from[2] * to[0] - from[0] * to[2];
    z = from[0] * to[1] - from[1] * to[0];
  }
  const len = Math.hypot(x, y, z, r) || 1;
  return [x / len, y / len, z / len, r / len];
}

/** Compose position/quaternion/scale into a column-major mat4 at `offset`. */
function composeMat4(p: Vec3, q: Quat, s: Vec3, out: Float32Array, offset: number): void {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const [sx, sy, sz] = s;

  out[offset + 0] = (1 - (yy + zz)) * sx;
  out[offset + 1] = (xy + wz) * sx;
  out[offset + 2] = (xz - wy) * sx;
  out[offset + 3] = 0;
  out[offset + 4] = (xy - wz) * sy;
  out[offset + 5] = (1 - (xx + zz)) * sy;
  out[offset + 6] = (yz + wx) * sy;
  out[offset + 7] = 0;
  out[offset + 8] = (xz + wy) * sz;
  out[offset + 9] = (yz - wx) * sz;
  out[offset + 10] = (1 - (xx + yy)) * sz;
  out[offset + 11] = 0;
  out[offset + 12] = p[0];
  out[offset + 13] = p[1];
  out[offset + 14] = p[2];
  out[offset + 15] = 1;
}
