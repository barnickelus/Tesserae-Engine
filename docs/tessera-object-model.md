# Tessera Object Model

> One of the core "secret sauce" systems of Tesserae-Engine.
>
> Defines the `Tessera` — the fundamental primitive of the engine — and the
> enumerations it references. The canonical implementation lives in
> [`src/core/`](../src/core).

## Motivation

_Why a single, flat, data-oriented primitive ("Tessera") underpins the engine._

## The Tessera

A `Tessera` is the atomic building block of a scene. It carries spatial
transform data plus a set of typed and scalar attributes that drive rendering
and semantics.

| Field           | Type                                | Meaning                                          |
|-----------------|-------------------------------------|--------------------------------------------------|
| `position`      | `[number, number, number]`          | World-space position (x, y, z).                  |
| `rotation`      | `[number, number, number, number]`  | Orientation as a quaternion (x, y, z, w).        |
| `scale`         | `[number, number, number]`          | Per-axis scale.                                  |
| `primitiveType` | `number` (`PrimitiveType`)          | Which base primitive shape this Tessera is.      |
| `materialType`  | `number` (`MaterialType`)           | Which material model to render with.             |
| `semanticClass` | `number` (`SemanticClass`)          | Semantic/category label for the Tessera.         |
| `importance`    | `number`                            | Relative importance (e.g. for LOD / culling).    |
| `curvature`     | `number`                            | Surface curvature parameter.                     |
| `edgeStrength`  | `number`                            | Edge emphasis / sharpness parameter.             |

The typed fields are stored as plain `number`s for compact, data-oriented
storage, and reference the enums below.

## Enumerations

- **`PrimitiveType`** — the set of base primitive shapes. See
  [`src/core/PrimitiveType.ts`](../src/core/PrimitiveType.ts).
- **`MaterialType`** — the set of material models. See
  [`src/core/MaterialType.ts`](../src/core/MaterialType.ts).
- **`SemanticClass`** — the set of semantic categories. See
  [`src/core/SemanticClass.ts`](../src/core/SemanticClass.ts).

## Open Questions

- _Should `rotation` be a quaternion or Euler angles? (Currently quaternion.)_
- _What ranges are expected for `curvature` and `edgeStrength`?_
