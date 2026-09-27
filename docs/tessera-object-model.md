# Tessera Object Model

> One of the core "secret sauce" systems of Tesserae-Engine.
>
> Defines the `Tessera` — the fundamental primitive of the engine — and the
> enumerations it references. The canonical implementation lives in
> [`src/core/`](../src/core).

## Motivation

A scene is made of many small, independent pieces, so the primitive is flat
and data-oriented: plain numbers and tuples that pack straight into instance
buffers (`writeInstanceMatrices`) and cross any boundary — worker, GPU,
network — without a class hierarchy.

A tessera is also more than a transform. It stands for a patch of a real
surface, is seen only by the light that reaches it, and is read by an eye
whose acuity falls with distance: close up it must read as a tile, far away
it must send exactly the light its patch sent. That second job is the
tessera's **optical anatomy**, carried in `optics` and specified in
[optical-language.md](optical-language.md).

## The Tessera

A `Tessera` is the atomic building block of a scene. It carries spatial
transform data plus a set of typed and scalar attributes that drive rendering
and semantics.

| Field           | Type                                | Meaning                                          |
|-----------------|-------------------------------------|--------------------------------------------------|
| `position`      | `[number, number, number]`          | World-space position (x, y, z).                  |
| `rotation`      | `[number, number, number, number]`  | Orientation as a quaternion (x, y, z, w). Local +Z is the face normal; local +X runs along the tile's course. |
| `scale`         | `[number, number, number]`          | Per-axis scale.                                  |
| `primitiveType` | `number` (`PrimitiveType`)          | Which base primitive shape this Tessera is.      |
| `materialType`  | `number` (`MaterialType`)           | Which material model to render with.             |
| `semanticClass` | `number` (`SemanticClass`)          | Semantic/category label for the Tessera.         |
| `importance`    | `number`                            | Relative importance, 0–1 — how much the eye would miss this patch (colour variance, metal/non-metal border, curvature, semantic region). Drives tile size. |
| `curvature`     | `number`                            | Normal dispersion of the patch, 1 − \|N̄\|, 0 (flat) to 1 (wraps around). |
| `edgeStrength`  | `number`                            | How strongly the patch holds a directed colour edge, 0–1 (colour structure tensor anisotropy × tile size). Steers the course. |
| `optics`        | `TesseraOptics` (optional)          | The optical anatomy below.                       |

The typed fields are stored as plain `number`s for compact, data-oriented
storage, and reference the enums below.

## The optical anatomy (`TesseraOptics`)

Colours are linear light — they add, which is the whole point.

| Part | Fields | Rule (in [`optics.ts`](../src/core/optics.ts)) |
|---|---|---|
| **patch** — what it stands for | `area`, `projectedArea`, `meanNormalLength` | `describePatch`: the samples the tile owns after relaxation; projected area = area · \|N̄\| |
| **face** — what the light meets | `color`, `roughness`, `metalness`, `coverage`, `rise` | colour: `linearMean`, then `compensateFace`; roughness: `toksvig`; side: `faceSide` so the face covers exactly `coverage` = inset² of the projected patch; rests at `rise` above the patch centroid |
| **course** — which way it runs | `course` (unit tangent) | andamento: a direction field along colour contours, relaxed (see optical-language.md §8) |
| **joint** — what it is set in | `bedTint`, `depth` | a painted setting bed of albedo `bedTint` · source colour, `depth` below the faces |
| **paint** — divisionist accents | `glyph`, `accents`, `coverage` | accents `equiluminant` with the face, mixed in linear light to the face colour |

The invariant all of it serves: seen unresolved, `coverage · face + (1 −
coverage) · bed` equals the patch's own linear-light colour, under the same
light, with the same gloss — tested in
[`tools/test/optics.test.mjs`](../tools/test/optics.test.mjs) and measured on
real models by [`tools/optics-check.mjs`](../tools/optics-check.mjs).

## Enumerations

- **`PrimitiveType`** — the set of base primitive shapes. See
  [`src/core/PrimitiveType.ts`](../src/core/PrimitiveType.ts).
- **`MaterialType`** — the set of material models. See
  [`src/core/MaterialType.ts`](../src/core/MaterialType.ts).
- **`SemanticClass`** — the set of semantic categories. See
  [`src/core/SemanticClass.ts`](../src/core/SemanticClass.ts).

## Open Questions

- _Metalness is continuous in `optics.face`; should `MaterialType.Metallic`
  remain a separate category, or become "metalness > 0.5"?_
- _`rotation` stays a quaternion; the course is also stored as a tangent so
  it survives skinning's re-orientation without decomposing a matrix._
