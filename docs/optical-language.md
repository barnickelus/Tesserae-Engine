# The optical language of the tessera

> A tessera is a word in an optical language. It stands for a patch of a
> three-dimensional surface; it is seen only by the light that reaches it; and
> it is read by an eye whose acuity falls with distance. Up close it is an
> object — a face, a course, a joint. Far enough away the eye can no longer
> resolve it and receives only the light its patch sends. The architecture
> below is what a tile must be, so that both readings are true at once.

The live implementation is [`examples/tessera-mosaic.html`](../examples/tessera-mosaic.html);
the rules as tested pure functions are [`src/core/optics.ts`](../src/core/optics.ts),
and the tile's data shape is `TesseraOptics` in [`src/core/Tessera.ts`](../src/core/Tessera.ts).
The same rules as a module any page can use are [`examples/lib/tessera-kit.js`](../examples/lib/tessera-kit.js)
(tested in Node by `tools/test/tessera-kit.test.mjs`);
[`examples/tessera-vibemesh.html`](../examples/tessera-vibemesh.html) lays a
live, puppeted head with it — under the room rig through Khronos PBR Neutral
rather than AgX, since a likeness is judged against a camera (its tiles carry a
per-part specular so they shine as the skin does). The kit carries the page's
paints — flat, pure, muted (the patch's own light and dark as the accents,
`decomposeMuted`) and rgb (a per-channel dither of pure R, G, B, exact in
linear light and lifted where a tone curve clips its dots) — and cuts a part
that declares a `flow` (hair, down the head) as slivers along it.
Nothing here was kept on argument alone: every rule was measured by the eye
model below, and the ones that didn't help are listed with the ones that did.

## The eye

[`tools/optics-check.mjs`](../tools/optics-check.mjs) renders, from one camera
under one light, the original model with its own materials and the tessera
version of it, then models a human viewer with **S-CIELAB** (Zhang & Wandell):
both images go to an opponent colour space (luminance, red–green, blue–yellow),
each channel is blurred by the eye's contrast sensitivity at a viewing distance
given in **pixels per degree** (ppd), and the two are compared in CIELAB. More
ppd = further away. The eye blurs colour far more than luminance, which is
exactly what lets a divisionist tile fuse while a light/dark texture on it
would still show.

Reported over the object's pixels, per distance:

| measure | meaning |
|---|---|
| ΔE  | mean S-CIELAB difference — ~1 just noticeable, 2–3 small, >10 obvious |
| ΔL* | signed lightness bias, tessera − original (positive = too bright) |
| ΔC / ΔC* | chroma error / signed saturation bias (negative = greyer) |
| form | SSIM of the eye-filtered lightness — how well light and shade, the cue the eye reads 3D shape from, survive |

The ladder: at the standard framings a tile subtends several arcminutes at
60 ppd (clearly a mosaic), and well under one at 1920 ppd (fully fused). Near
distances measure the mosaic as a mosaic; far ones measure whether it still
tells the truth about the object. Builds are seeded, so every number below
repeats exactly.

## Anatomy of a tessera

### 1. Truth — what the patch really looks like

Every tile starts from a colour bake: fourteen orthographic photographs of the
real model, each surface sample taking its colour from the most head-on view.
Two things were wrong with "most head-on":

- **It never asked whether the view could see the sample.** A depth pass now
  rejects any view where something else is nearer along the ray, so a sample
  takes the most head-on view *that sees it*. On the Empress 85% of samples
  are seen by at least one of the fourteen views; only the 15% none sees
  (deep folds, under the crown) still fall back to the old guess.
- **Skinned rigs were photographed posed but looked up unposed.** The bake
  draws a SkinnedMesh as three.js draws it — in the rig's rest pose — while
  the lookups used bind-space positions. On Michelle, whose rest pose isn't
  her bind pose, *not one sample* passed the depth test: every lookup read
  some other part of her body, which is where her pale strips came from.
  Samples now carry a posed position for the lookup alone: 0% → 93% seen,
  coverage 96% → 100%, the strips gone.
- **A tile stands only for surface that can be seen.** A surface inside
  another is hidden in the original's render pixel by pixel, by its depth
  buffer; laid as tesserae it isn't. VibeMesh's bust runs its neck tube up
  inside the head, and tiles laid on that buried neck — millimetres across,
  sitting proud of it — stood out through the chin: the tiled jaw ended
  1.7 cm short of the mesh's, the eye model's hottest spot. The kit's
  `visibleVertices` renders the depth of every part (and of the eyes and
  teeth, which aren't tiled but still hide what's behind them) from 26
  directions — cube faces, edges and corners, so every normal is within ~25°
  of one — and lays tiles only where a view facing the surface within 45°
  finds it frontmost. The mosaic page asks the same question of a scanned
  model when it bakes colour, and keeps what no view sees, with a guessed
  colour; for a model built from overlapping parts, not laying it is the
  answer.

### 2. Surface — how it answers light

The first measurement overturned the obvious hypothesis. Tiles read **13–17
L\* too bright**, not darker, in every paint mode alike — because the Empress
is gilded (metalness ≈ 1 over most of her) and the tiles painted her as
yellow plaster (metalness 0.06). Each tile now carries its patch's own
**metalness and roughness**, baked in a second pass alongside colour and fed
to the shader per instance.

A flat face can't show the spread of normals inside the curved patch it
replaces, and that spread is what made the patch's highlight broad. By
**Toksvig's rule** it moves into roughness: slope variance σ² ≈ (1 − |N̄|)/|N̄|
from the mean normal's length, GGX α² grows by 2σ². A gold tile on a curved
patch becomes satin, so it glows where the patch glowed instead of flashing as
a mirror. (Empress bust, 240 ppd: ΔE 11.6 → 8.8 with this and the next two.)

### 3. Light — what reaches it

Metal has no diffuse colour: it shows only what it reflects. Under bare
directional lights a gilded surface renders near-black between highlights, so
the page gained a **room** light — an environment to reflect
(RoomEnvironment, prefiltered for every roughness) plus the key light — seen
through **AgX** tone mapping. The original and the tiles are always seen under
the same light. Measured, Empress bust at 240 ppd: no tone map 14.8, ACES
11.7, **AgX 9.6**. The earlier **studio** rig is kept as an option.

### 4. Colour — the patch's light, averaged as light

Light adds in linear units, so a tile carries its patch's **linear-light
mean**. Averaging the sRGB-encoded bake (as before) darkens every mixed patch:
half black and half white averages to sRGB 0.5, which is 0.21 in light — the
patch sends 0.5.

### 5. Place — where the face rests

A tessera's **face rests on its patch's highest point** along the mean
normal, and its body sinks below the surface into the bed — as a flat tile
pressed onto a curved bed does. Centring the body on the surface had pushed
every face out a quarter cell and swelled the figure; putting the face on the
best-fit plane instead let convex patches bulge through the middle of large
tiles.

### 6. Extent — how much it covers

A face covers exactly **inset² of its patch's projected area** (area · |N̄|).
Sizing faces by their octree cell made coverage depend on how the surface met
the grid — a plane crosses |nx|+|ny|+|nz| cells per cell-area, so faces tilted
toward a grid diagonal piled up (coverage to 1.4 at 'thin' grout) while
axis-aligned ones showed their joints: grout that came and went with
orientation. Projected, not raw, area keeps a cell that wraps a thin limb from
getting one giant tile for its whole girth.

### 7. Joint — the bed it is set in

The gaps used to show the black behind the figure. Now there is a **setting
bed**: the source surface drawn just below the faces, painted as mosaicists
painted theirs — the local colour laid in broadly (a heavy mip blur),
darkened to BED_TINT = 0.5, matte — so a joint reads as a shadowed line of
the same colour. Because the joint is part of the tile's arithmetic, the face
pays back the light the joint doesn't send:

    T = S · (1 − (1 − c)·BED_TINT) / c        (linear light, c = inset²)

so that c·T + (1 − c)·BED_TINT·S = S. A tile's **sides take the mortar
colour** too: in a real mosaic the joint is packed up to the face. Bare sides
are extra lit surface the source never had — measured, they brightened every
model by ~1 L\*; packed, ΔE at 240 ppd fell 8.7 → 7.7 on Michelle and 7.2 →
6.6 on the Empress bust (on the already slightly dark Portrait, ±0.3). On the
dielectric Portrait the lightness bias at full fusion is about −2 L\* (near a
just-noticeable difference).

### 8. Course — which way it runs (andamento)

Tiles used to take their in-plane rotation from the shortest rotation of +Z
onto their normal, which lays them on a skewed grid: every edge in the image
became a staircase. Now, after Hausner (*Simulating Decorative Mosaics*,
SIGGRAPH 2001), carried onto a 3D surface:

1. a **direction field** over the tiles — along the source's colour contours
   where it has edges (the minor axis of each patch's colour structure tensor),
   plain horizontal courses where it hasn't, diffused across neighbours with
   4-fold symmetry (a square looks the same turned 90°);
2. **relaxation** — each tile claims the samples nearest it under its own
   square metric (L∞ in its course frame, scaled by its size, so the octree's
   adaptive sizes survive) and moves to their centroid; six rounds. Each tile
   ends owning a patch no other tile owns — the patch every rule above
   pre-filters. Slivers lay their long axis along the contour itself.

Course drift (mean misalignment with neighbours, 0° = perfect courses):
Empress 10.9° → 8.4°, Portrait 11.9° → 8.2°, Michelle 15.7° → 11.8°, Fox
16.0° → 10.6°, Soldier 13.0° → 11.7°, Helmet 13.2° → 10.2°. ΔE, off → on, flat paint:

| view | 60 ppd | 120 ppd | 240 ppd |
|---|---|---|---|
| Portrait, bust | 14.0 → 12.9 | 10.9 → 9.9 | 7.5 → 6.9 |
| Michelle, dancing | 21.0 → 19.5 | 13.4 → 12.6 | 8.1 → 7.7 |
| Empress, full figure | 8.0 → 8.3 | 4.7 → 4.9 | 2.8 → 2.9 |
| Empress, bust | 12.5 → 13.0 | 8.8 → 9.3 | 6.0 → 6.6 |

A clear gain on people, a small loss on dense gold ornament; on by default,
switchable (**LAYING: courses / grid**), and the HUD shows the course drift.

### 9. Paint — vibrate in colour, never in value

The divisionist modes bracket the target hue with two pure accents, solved in
linear light so the coverage-weighted mix is the target exactly. The accents
are now **equiluminant** with the target: HSL lightness isn't luminance (a
blue and a yellow of one HSL lightness differ ~8× in Y), so they had been
speckling the luminance channel — the one the eye reads form from, and
resolves about four times finer than colour. At one luminance the play is
pure chroma (Livingstone, *Vision and Art*, on why equiluminant colour
shimmers); an equiluminant checkerboard fuses at a quarter the distance of a
luminance one (tools/test/scielab.test.mjs). The glyph masks moved to a
texture array, one layer per glyph, so no mip level can blur one glyph's
coverage into its neighbour's.

## Results

The committed page before this work (its only light) against this one (room
light), flat paint, thin grout. ΔE, lower is better:

| view | 60 ppd | 240 ppd | 1920 ppd (fused) | ΔL\* fused | form, 240 ppd |
|---|---|---|---|---|---|
| Empress, full figure | 24.0 → **8.3** | 16.1 → **2.9** | 11.3 → **0.9** | +9.6 → +0.5 | 0.85 → 0.99 |
| Empress, bust | 34.0 → **13.0** | 29.6 → **6.6** | 17.7 → **3.1** | +14.7 → +2.3 | 0.68 → 0.97 |
| Portrait, bust | 17.9 → **12.9** | 14.3 → **6.9** | 4.4 → **2.5** | −2.1 → −2.0 | 0.78 → 0.95 |
| Michelle, SambaDance @1.3 s | 35.0 → **19.5** | 24.2 → **7.7** | 9.2 → **4.2** | +5.8 → +3.7 | 0.68 → 0.96 |

The whole Empress now fuses below a just-noticeable difference.

## What didn't work, and what's open

- **Khronos PBR Neutral tone mapping** — affine through the midtones, so in
  principle it preserves partitive mixing better than AgX. Measured worse
  everywhere (Portrait pure paint at fusion 2.9 → 4.3): hotter highlights
  expose the specular difference between tiles and source. Removed.
- **Equiluminant accents and the glyph texture array** moved ΔE by less than
  ±0.3 at these distances — paint is a small share of the remaining error.
  Kept because they're right in principle and cost nothing.
- **Metal still reads bright at fusion** (Empress bust +2.3 L\*, half-metal
  Michelle +3.7). Likely the compressive tone curve: E[T(L)] ≤ T(E[L]), so a
  pre-filtered highlight comes out brighter than the average of a sharp one.
- **Andamento on dense gold ornament** costs ~0.5 ΔE: its patches cut the
  relief differently from octree cells.
- **Pure paint fuses ~0.3–0.5 ΔE worse than flat** in room light; cause not
  yet found (not glyph mip bleed, not the tone curve's midtones).

## Reproduce

```
cd tools && npm install
node --test test/*.test.mjs                                   # the rules + the eye model
node optics-check.mjs Portrait "room,flat,thin|room,pure,thin" --zoom 2.2 --lift 0.3 --ppd 60,240,960,1920 --shots ../shots
node optics-check.mjs Empress "room,flat,thin|room,flat,thin,grid"                    # a variant is a list of button labels
node optics-check.mjs Michelle "room,flat,thin" --pose SambaDance@1.3
PAGE=path/to/older-page.html node optics-check.mjs Empress "flat,thin"                  # measure any version
```
