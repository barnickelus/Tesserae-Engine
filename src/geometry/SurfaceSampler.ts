/**
 * SurfaceSampler — turn a triangle mesh into a cloud of points on its surface.
 *
 * This is step one of the Tesserae reconstruction pipeline:
 *
 *     GLB  ->  [SurfaceSampler]  ->  surface samples  ->  TesseraGenerator
 *
 * It is framework-agnostic: it consumes plain typed arrays (the kind you can
 * pull off a GLTF/Three.js BufferGeometry) and produces plain sample data, so
 * the geometry layer carries no rendering-library dependency.
 *
 * Sampling is area-weighted: larger triangles receive proportionally more
 * samples, giving a uniform density across the surface regardless of how the
 * mesh is tessellated.
 */

export interface MeshData {
  /** Flat xyz positions, length = vertexCount * 3. */
  positions: Float32Array;
  /** Optional flat xyz normals, length = vertexCount * 3. */
  normals?: Float32Array;
  /** Optional triangle indices. If omitted, positions are treated as a triangle soup. */
  indices?: Uint32Array | Uint16Array;
}

export interface SurfaceSample {
  position: [number, number, number];
  normal: [number, number, number];
}

export interface SampleOptions {
  /** Deterministic RNG in [0, 1). Defaults to Math.random. */
  rng?: () => number;
}

type Vec3 = [number, number, number];

function triCount(mesh: MeshData): number {
  return mesh.indices ? mesh.indices.length / 3 : mesh.positions.length / 9;
}

function triIndices(mesh: MeshData, t: number): Vec3 {
  if (mesh.indices) {
    return [mesh.indices[t * 3], mesh.indices[t * 3 + 1], mesh.indices[t * 3 + 2]];
  }
  return [t * 3, t * 3 + 1, t * 3 + 2];
}

function readVec3(buf: Float32Array, i: number, out: Vec3): Vec3 {
  out[0] = buf[i * 3]; out[1] = buf[i * 3 + 1]; out[2] = buf[i * 3 + 2];
  return out;
}

export class SurfaceSampler {
  private readonly mesh: MeshData;
  private readonly cumulativeArea: Float64Array;
  private readonly totalArea: number;

  constructor(mesh: MeshData) {
    this.mesh = mesh;
    const n = triCount(mesh);
    this.cumulativeArea = new Float64Array(n);

    const a: Vec3 = [0, 0, 0], b: Vec3 = [0, 0, 0], c: Vec3 = [0, 0, 0];
    let running = 0;
    for (let t = 0; t < n; t++) {
      const [ia, ib, ic] = triIndices(mesh, t);
      readVec3(mesh.positions, ia, a);
      readVec3(mesh.positions, ib, b);
      readVec3(mesh.positions, ic, c);
      running += triangleArea(a, b, c);
      this.cumulativeArea[t] = running;
    }
    this.totalArea = running;
  }

  /** Total surface area of the mesh (in model units squared). */
  get area(): number { return this.totalArea; }

  /**
   * Draw `count` area-weighted samples from the surface. Position and normal
   * are interpolated across each chosen triangle using barycentric weights;
   * normals fall back to the face normal when the mesh has no normal attribute.
   */
  sample(count: number, options: SampleOptions = {}): SurfaceSample[] {
    const rng = options.rng ?? Math.random;
    const out: SurfaceSample[] = new Array(count);
    const a: Vec3 = [0, 0, 0], b: Vec3 = [0, 0, 0], c: Vec3 = [0, 0, 0];
    const na: Vec3 = [0, 0, 0], nb: Vec3 = [0, 0, 0], nc: Vec3 = [0, 0, 0];

    for (let i = 0; i < count; i++) {
      const t = this.pickTriangle(rng());
      const [ia, ib, ic] = triIndices(this.mesh, t);
      readVec3(this.mesh.positions, ia, a);
      readVec3(this.mesh.positions, ib, b);
      readVec3(this.mesh.positions, ic, c);

      // Uniform barycentric coordinates over the triangle.
      let u = rng(), v = rng();
      if (u + v > 1) { u = 1 - u; v = 1 - v; }
      const w = 1 - u - v;

      const position: Vec3 = [
        a[0] * w + b[0] * u + c[0] * v,
        a[1] * w + b[1] * u + c[1] * v,
        a[2] * w + b[2] * u + c[2] * v,
      ];

      let normal: Vec3;
      if (this.mesh.normals) {
        readVec3(this.mesh.normals, ia, na);
        readVec3(this.mesh.normals, ib, nb);
        readVec3(this.mesh.normals, ic, nc);
        normal = normalize([
          na[0] * w + nb[0] * u + nc[0] * v,
          na[1] * w + nb[1] * u + nc[1] * v,
          na[2] * w + nb[2] * u + nc[2] * v,
        ]);
      } else {
        normal = faceNormal(a, b, c);
      }

      out[i] = { position, normal };
    }
    return out;
  }

  /** Binary search the cumulative-area table for a value in [0, totalArea). */
  private pickTriangle(r: number): number {
    const target = r * this.totalArea;
    const arr = this.cumulativeArea;
    let lo = 0, hi = arr.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] < target) lo = mid + 1; else hi = mid;
    }
    return lo;
  }
}

function triangleArea(a: Vec3, b: Vec3, c: Vec3): number {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
  const cx = aby * acz - abz * acy;
  const cy = abz * acx - abx * acz;
  const cz = abx * acy - aby * acx;
  return 0.5 * Math.hypot(cx, cy, cz);
}

function faceNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
  return normalize([
    aby * acz - abz * acy,
    abz * acx - abx * acz,
    abx * acy - aby * acx,
  ]);
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}
