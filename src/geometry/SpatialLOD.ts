/**
 * SpatialLOD — voxel-grid decimation of a surface-sample cloud.
 *
 * Buckets samples into a uniform 3D grid and returns one representative sample
 * per occupied cell (averaged position and normal). A larger cell size yields
 * fewer, coarser representatives; a smaller cell size preserves detail.
 *
 * This is the mechanism behind "Continuous Abstraction" (see
 * docs/continuous-abstraction.md): sweeping the cell size from large to small
 * morphs the model between a few big tesserae (sculpture) and many tiny ones
 * (representation). The downstream TesseraGenerator turns the representatives
 * into Tesserae, scaling each to roughly fill its cell.
 */

import type { SurfaceSample } from './SurfaceSampler';

interface Cell {
  px: number; py: number; pz: number;  // summed position
  nx: number; ny: number; nz: number;  // summed normal
  n: number;                            // sample count
}

export interface DecimateResult {
  samples: SurfaceSample[];
  /** The cell size used, echoed for convenience (e.g. to derive Tessera scale). */
  cellSize: number;
}

/**
 * Reduce `samples` to one representative per occupied grid cell of edge
 * `cellSize` (in model units). Representative position/normal are the means of
 * the samples that fell in the cell.
 */
export function decimate(samples: SurfaceSample[], cellSize: number): DecimateResult {
  if (cellSize <= 0) throw new Error('cellSize must be > 0');
  const inv = 1 / cellSize;
  const cells = new Map<string, Cell>();

  for (let i = 0; i < samples.length; i++) {
    const p = samples[i].position, nrm = samples[i].normal;
    const cx = Math.floor(p[0] * inv);
    const cy = Math.floor(p[1] * inv);
    const cz = Math.floor(p[2] * inv);
    const key = cx + ',' + cy + ',' + cz;
    let cell = cells.get(key);
    if (!cell) {
      cell = { px: 0, py: 0, pz: 0, nx: 0, ny: 0, nz: 0, n: 0 };
      cells.set(key, cell);
    }
    cell.px += p[0]; cell.py += p[1]; cell.pz += p[2];
    cell.nx += nrm[0]; cell.ny += nrm[1]; cell.nz += nrm[2];
    cell.n++;
  }

  const out: SurfaceSample[] = new Array(cells.size);
  let i = 0;
  for (const cell of cells.values()) {
    const inv2 = 1 / cell.n;
    const nlen = Math.hypot(cell.nx, cell.ny, cell.nz) || 1;
    out[i++] = {
      position: [cell.px * inv2, cell.py * inv2, cell.pz * inv2],
      normal: [cell.nx / nlen, cell.ny / nlen, cell.nz / nlen],
    };
  }
  return { samples: out, cellSize };
}

/**
 * Pick a cell size that targets roughly `targetCount` representatives, given a
 * sample cloud spanning a bounding box of the supplied diagonal length. This is
 * a heuristic seed for the abstraction slider, not an exact solver — callers can
 * refine by re-running `decimate` if the count is far off.
 */
export function cellSizeForTarget(boundingDiagonal: number, targetCount: number): number {
  // Treat the surface as roughly 2D: cells scale with the square root of count.
  const n = Math.max(1, targetCount);
  return boundingDiagonal / Math.sqrt(n);
}

/** Axis-aligned bounding box diagonal of a sample cloud. */
export function boundingDiagonal(samples: SurfaceSample[]): number {
  if (samples.length === 0) return 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const s of samples) {
    const [x, y, z] = s.position;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  return Math.hypot(maxX - minX, maxY - minY, maxZ - minZ);
}
