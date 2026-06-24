/**
 * Tessera — the fundamental primitive of Tesserae-Engine.
 *
 * A flat, data-oriented description of a single primitive in a scene. The
 * `primitiveType`, `materialType`, and `semanticClass` fields are stored as
 * plain numbers and reference the corresponding enums in this directory.
 *
 * See docs/tessera-object-model.md for the conceptual model.
 */
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
}
