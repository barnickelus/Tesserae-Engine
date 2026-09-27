/**
 * Tessera — the fundamental primitive of Tesserae-Engine.
 *
 * A flat, data-oriented description of a single primitive in a scene. The
 * `primitiveType`, `materialType`, and `semanticClass` fields are stored as
 * plain numbers and reference the corresponding enums in this directory.
 *
 * A tessera is also a word in an optical language: it stands for a patch of
 * a 3D surface, is seen only by the light that reaches it, and is read by an
 * eye whose acuity falls with distance. `optics` carries that anatomy — what
 * the tile stands for, what its face shows the light, which way its course
 * runs, and the joint it is set in. The rules that fill it in live in
 * ./optics.ts; the measurements behind them in docs/optical-language.md.
 *
 * See docs/tessera-object-model.md for the conceptual model.
 */
import type { RGB, Vec3 } from './optics';

export interface Tessera {
  /** World-space position (x, y, z). */
  position: [number, number, number];

  /** Orientation as a quaternion (x, y, z, w). */
  rotation: [number, number, number, number];

  /** Per-axis scale (x, y, z). */
  scale: [number, number, number];

  /** Base primitive shape. See {@link PrimitiveType}. */
  primitiveType: number;

  /** Material model. See {@link MaterialType}. */
  materialType: number;

  /** Semantic category. See {@link SemanticClass}. */
  semanticClass: number;

  /** Relative importance (e.g. for LOD / culling). */
  importance: number;

  /** Surface curvature parameter. */
  curvature: number;

  /** Edge emphasis / sharpness parameter. */
  edgeStrength: number;

  /** The optical anatomy, when the tessera was cut from a real surface. */
  optics?: TesseraOptics;
}

/**
 * What a tessera must preserve for the eye. Colours are LINEAR light (they
 * add); positions and lengths are in the tessera's world units.
 */
export interface TesseraOptics {
  /** The patch of surface this tessera stands for, and replaces. */
  patch: {
    /** Surface area of the patch. */
    area: number;
    /** Area projected onto the face's plane (area · |N̄|) — what a flat face can cover. */
    projectedArea: number;
    /** |mean unit normal| of the patch: 1 flat, → 0 as it wraps around. */
    meanNormalLength: number;
  };

  /** The face: the only part of the tile the light and the eye meet. */
  face: {
    /** Base colour, compensated for the joint (see compensateFace). */
    color: RGB;
    /** Toksvig-filtered: the patch's roughness plus its lost normal spread. */
    roughness: number;
    metalness: number;
    /** Share of the patch the face covers (inset²); the rest is joint. */
    coverage: number;
    /** Rests on the patch's highest point along its normal; the body sinks below. */
    rise: number;
  };

  /** The course (andamento): the unit tangent the tile's sides run along. */
  course: Vec3;

  /** The joint the tile is set in. */
  joint: {
    /** Bed albedo as a fraction of the source colour (a painted setting bed). */
    bedTint: number;
    /** How far below the faces the bed lies. */
    depth: number;
  };

  /** Divisionist paint on the face, if any. */
  paint?: {
    /** Glyph mask (a layer of the glyph texture array). */
    glyph: number;
    /** Two accents, each equiluminant with the face (see equiluminant). */
    accents: [RGB, RGB];
    /** Measured share of the face under each accent. */
    coverage: [number, number];
  };
}
