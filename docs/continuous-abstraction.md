# Continuous Abstraction

> A feature discovered while building the first benchmark — not in the original
> vision, but flowing directly from the [north star](vision.md).

## The idea

Instead of a traditional voxel **resolution** slider, Tesserae-Engine exposes an
**abstraction** slider. It runs continuously from coarse to fine:

```
1%   10%   25%   50%   75%   100%
```

The object continuously morphs between **sculpture** and **representation**:

| Abstraction | Tesserae        | Glyphs        | Optical blending |
|-------------|-----------------|---------------|------------------|
| **1%**      | huge tesserae   | minimal       | strong           |
| **100%**    | tiny tesserae   | complex face plates | rich materials |

At low abstraction the model reads as a few big geometric carriers — closer to a
sculpture. At high abstraction it resolves into many small tesserae with detailed
face plates and materials — closer to a faithful representation. Sweeping the
slider is a smooth morph between the two, not a set of discrete LOD steps.

This is more interesting than a resolution slider because abstraction is about
*meaning and reading distance*, which is exactly what the north star says a
tessera carries.

## How it maps to the pipeline

Abstraction is driven by the voxel cell size in
[`src/geometry/SpatialLOD.ts`](../src/geometry/SpatialLOD.ts):

- **Low abstraction** → large cell size → few, large representative tesserae.
- **High abstraction** → small cell size → many, small tesserae.

The surface is sampled once at high density; `decimate(samples, cellSize)`
collapses the cloud to one representative per occupied cell, and
[`TesseraGenerator`](../src/geometry/TesseraGenerator.ts) scales each Tessera to
roughly fill its cell. As abstraction rises, face-plate complexity and material
richness scale up alongside the shrinking tesserae.

## Open questions

- What is the exact mapping from slider position to cell size (linear, log)?
- How do glyph density and optical blending interpolate across the range?
- Should abstraction be global, or vary locally by `importance` per region?
