# Vision

> What Tesserae-Engine is, who it's for, and why it exists.

## North Star

Tesserae Engine is an adaptive rendering system that reconstructs 3D models
using procedural tesserae rather than rendering polygon meshes directly. A
tessera is a geometric carrier of visual information. Primitive size, shape,
material, and face plate composition communicate focus, texture, meaning, and
reading distance.

That sentence is the north star. Everything else — voxels, glyphs, Chuck Close
influence, avatars, style packs — should flow from that idea.

**Tesserae-Engine is a perception engine, not a voxel renderer.** The goal is not
to copy geometry, polygons, or voxels — it is to preserve *human perception*. The
engine asks "what information does the visual system need to recognize this
object?" and grows intelligent, adaptive tesserae to supply exactly that. See
[perception-engine.md](perception-engine.md) for the full architecture.

## Goals

- _Goal 1_
- _Goal 2_
- _Goal 3_

## Non-Goals

- _What this project intentionally does not try to do._

## Guiding Principles

- **Tesserae are sculptural pixels, not voxels.** Voxel engines preserve
  *volume*; Tesserae-Engine preserves *perception*. A reconstruction may be less
  geometrically faithful yet communicate the object more effectively — this
  distinction is emerging as the defining concept of the project.
- **Primitive shape is visual language.** The choice of sphere / cube / diamond
  is part of how the object reads, not merely a geometric substitute.
- **Preserve perception over volume.** When the two conflict, optimize for what
  the eye understands at the intended reading distance.
