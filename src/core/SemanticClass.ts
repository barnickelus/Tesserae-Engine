/**
 * SemanticClass — semantic/category label for a Tessera.
 *
 * Stored on {@link Tessera.semanticClass} as a number. Used by higher-level
 * systems (e.g. style packs) to reason about what a Tessera represents.
 * Extend as the engine's taxonomy grows.
 */
export enum SemanticClass {
  Unknown = 0,
  Structure = 1,
  Surface = 2,
  Detail = 3,
  Accent = 4,
}
