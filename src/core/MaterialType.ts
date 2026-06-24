/**
 * MaterialType — the set of material models a Tessera can be rendered with.
 *
 * Stored on {@link Tessera.materialType} as a number. Extend as the engine's
 * material set grows.
 */
export enum MaterialType {
  Unlit = 0,
  Standard = 1,
  Metallic = 2,
  Dielectric = 3,
  Emissive = 4,
}
