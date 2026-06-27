# Perception Engine

> The defining direction of Tesserae-Engine. This supersedes the "voxels with
> better shapes" framing. Tesserae-Engine is **not** a voxel renderer, a point
> cloud, or an instanced-mesh demo — it is a **perception-driven renderer** where
> intelligent tesserae cooperate to reconstruct objects with far less geometric
> information while preserving what humans actually perceive.

## North Star

The goal is **not** to copy geometry, preserve polygons, or even preserve voxels.
The goal is to **preserve human perception**.

Every decision asks: *what information does the human visual system need in order
to recognize this object?* The engine reproduces the visual cues humans use for
recognition rather than reproducing every polygon.

## A tessera is an intelligent visual device

Not simply a primitive — think of tesserae as **letters in an alphabet**, not
cubes in Minecraft. Each tessera has:

- a **primitive body** (from a family — sphere, rounded cube, diamond, capsule,
  lens, donut, star, pyramid, prism, pebble, bridge, saddle, corner, plug, …)
- one or more **faceplates** (optical glyphs: circle, ring, diamond, cross,
  flower, chevron, engraving, relief, micro-patterns)
- a **relief profile**, **material properties**, **connection signatures**,
  **semantic metadata**, and **rendering behavior**

Thousands combine into a **visual language**.

## Tessera families (LEGO, not one brick)

A family is a set of compatible pieces designed so **no empty volume remains**.
Large pieces create structure; small companion **plug tesserae** fill the gaps.
Mixing spheres and diamonds alone still leaves voids — so every family ships
dedicated plugs.

Example Sphere Family: Core Sphere · Half · Quarter · Donut · Ring Plug ·
Corner Plug · Edge Plug · Bridge · Saddle · Transition · Cap · Micro Plug.

The renderer chooses whichever combination **completely fills space**. (First
step prototyped in [`tessera-occupancy.html`](../examples/tessera-occupancy.html)
`packed` mode: spheres + a curvature-matched concave plug.)

## Connection grammar

Every tessera exposes **ports** — North, South, East, West, Top, Bottom — each
with a **connection signature** (Curve A/B, Flat, Socket, Peg, Concave, Convex,
Bridge, Empty). Neighbors connect only when signatures are compatible — closer to
**DNA base pairing** or protein docking than magnets. Some attract, some repel,
some require transition pieces. The engine builds an **Affinity Matrix** and
*grows assemblies* rather than placing isolated objects.

## Importance-driven rendering (the biggest architectural change)

Density is based on **perceptual importance**, not polygon density or distance.
Build an **Importance Map** before placement from: curvature, silhouette, color
contrast, feature importance, semantic regions, directional flow, viewer
position.

| Region | Importance |
|---|---|
| Hairline, eyes | maximum |
| Mouth | very high |
| Eyebrows, hands, fingertips | high |
| Cheeks | medium |
| Forehead, neck, shirt | low |
| Background | very low |

High-importance features get **smaller, denser, better-oriented, more expressive**
tesserae; the forehead beside a hairline may use tesserae 4× larger — intentionally.
(First prototype: [`importance-tesserae.html`](../examples/importance-tesserae.html).)

## Continuous abstraction

Smoothly transition from sculpture to representation, continuously:
1% abstract sculpture → 5% large symbolic tesserae → 20% recognizable →
50% strong likeness → 100% photographic perception.

## Adaptive intelligence

Tesserae are not identical. Each decides locally: subdivide? grow? change
primitive? become a bridge / corner / plug? rotate? expose a different faceplate?
**Local decisions create global structure.**

## Optical faceplates (Chuck Close)

Each tessera face carries a miniature optical language (circle, ring, diamond,
triangle, flower, cross, glyphs, engraving, relief, grooves, micro-patterns).
From a distance they **blend into continuous color**; up close they are sculptural
detail. **Faceplate is independent from primitive geometry.**

## Matter, not geometry (stem tesserae)

Longer horizon: store **matter**, not geometry. Every tessera begins identical —
a **stem cell** — and *differentiates* into bone, muscle, skin, fat, hair, water,
glass, stone, metal, cloth, smoke. Each holds state: material, temperature,
density, pressure, humidity, age, energy, transparency, neighbor affinity.

- **Phase changes:** water↔ice↔vapor, stone→molten, metal→glowing→molten — the
  tessera changes behavior rather than being swapped for another system.
- **Transparency by accumulation:** each tessera ~`alpha 0.995`; one layer nearly
  invisible, thousands opaque. Skin, water, fog, glass, tissue emerge from density
  rather than special effects.
- **Build inside-out:** volume → material field → differentiate stem tesserae →
  grow internal structure → surface emerges. Objects have internal matter, not
  hollow shells.

## Reverse-engineering reality (growth blueprint)

Instead of *Reality → Scan → Mesh → Render*, aim for *Reality → Observe → Analyze
→ Infer Structure → Generate Growth Blueprint → Grow Intelligent Tesserae →
Optimize for Perception → Render*. Store a **procedural description** (skeletal
proportions, muscle volumes, fat distribution, skin thickness, hair flow, facial
landmarks, semantic regions) and *grow* a plausible object from it rather than
reproducing the mesh verbatim.

## Viewer-adaptive rendering

Estimate viewer head position / distance (front camera; not full eye-tracking). A
dynamic **Perceptual Importance Field** follows the viewer; the best tesserae
migrate toward whatever is being inspected. Perception becomes viewer-dependent —
not fixed LOD.

## Pipeline

```
Mesh → Analyze (curvature, silhouette, semantic importance, contrast)
     → Generate Importance Map → Generate Tessera Cloud
     → Optimize Neighbor Connections → Resolve Gaps
     → Assign Faceplates → Assign Materials → Render
```

## Performance

Everything stays **GPU-instanced** — one draw call per primitive family where
possible. Per-instance data: position, rotation, scale, primitive ID, family ID,
faceplate ID, material ID, importance, connection state, semantic region. Keeps
millions of tesserae feasible.

## Prototype status

- [x] Space-filling families / plugs — `tessera-occupancy.html` (`packed`)
- [x] Importance-driven density + faceplates + continuous abstraction —
      `importance-tesserae.html`
- [ ] Connection grammar + Affinity Matrix
- [ ] Adaptive per-tessera decisions (subdivide / become plug / bridge)
- [ ] Stem tesserae, materials, phase changes, transparency-by-accumulation
- [ ] Growth blueprint + inside-out volumetric build
- [ ] Viewer-adaptive importance field
