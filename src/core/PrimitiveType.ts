/**
 * PrimitiveType — the set of base primitive shapes a Tessera can represent.
 *
 * Stored on {@link Tessera.primitiveType} as a number. Extend as the engine's
 * primitive set grows.
 */
export enum PrimitiveType {
  Box = 0,
  Sphere = 1,
  Cylinder = 2,
  Cone = 3,
  Plane = 4,
  Torus = 5,
}
