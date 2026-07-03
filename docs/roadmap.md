# Roadmap

> Planned milestones and features for Tesserae-Engine.
>
> **Guiding question:** not "can we build an engine?" but "can a tesserae cloud
> do something visually and perceptually new — can it *replace a mesh*?"
> Everything below is optimized toward answering that. Stay experimental,
> stay prototype-focused.

## Milestones

### M0 — Foundations
- [x] Repository structure and documentation scaffolding
- [ ] Project tooling / build setup — **deferred until it's a blocker.**
      Vite, tsconfig, bundlers, CI, linting are infrastructure, not progress,
      while the core hypothesis is unproven. Prototypes stay self-contained HTML.

### M1 — Performance Proof
- [x] `examples/primitive-cloud.html` — GPU-instanced primitive benchmark
- [x] Animate Tesserae toggle — measure GPU + per-instance animation cost (VRM-avatar question)
- [ ] Measure max tesserae (static **and** animated) on M-series Mac, gaming PC, iPad Safari
- [ ] Target: ~100k tesserae smooth on iPad Safari, ~500k+ on desktop

### M2 — Form Reconstruction (the first truly important milestone)
- [x] `src/geometry/` — SurfaceSampler, TesseraGenerator, SpatialLOD
- [x] `examples/glb-sampler.html` — GLB → 10k/25k/50k surface tesserae, with
      inspection modes for form validation (ghost mesh, normals debug, size)
- [ ] **Validate reconstruction by perception, not instance count:**
  - [ ] Does the silhouette hold?
  - [ ] Do curved surfaces read correctly?
  - [ ] Are normals oriented correctly?
  - [ ] Does the reconstruction still *feel like* the original model?

### M3 — Animated Avatar (stress every system at once)
- [x] `examples/tessera-avatar.html` — animated GLB → sample → bind tesserae to
      bones → animate → instanced render (Soldier/Robot/Fox, no VRM yet)
- [ ] Success criteria: skeletal model loads; tesserae stay attached through
      animation; instanced; rounded cubes; ~10k animated tesserae; 60 FPS desktop
- [ ] Then revisit VRM / true avatars

### M4 — Primitive Mixing (visual language over geometric accuracy)
- [x] Procedural primitive variation in `glb-sampler.html`
      (≈70% rounded cubes / 20% spheres / 10% diamonds)
- [x] Validated: **primitive shape is visual language, not just a geometric
      substitute.** Sphere reads most sculptural; cube reads voxelized; diamond
      breaks surface continuity. Mixing adds *richness* more than fidelity.
      Readability ranking observed: sphere > mixed > rounded > cube > diamond.

### M5 — Semantic Sizing (validate BEFORE optical blending)
- [x] `examples/semantic-tesserae.html` — Soldier with tesserae sized by manual
      body region (Face small → Hair → Clothing → Boots largest), with a
      semantic-on/off toggle and a count control to A/B against "more tesserae"
- [ ] **Answer:** does semantic variation improve character readability more than
      simply adding more tesserae?
- [ ] If yes → semantic sizing becomes a core architectural component, ahead of
      optical blending, glyphs, and advanced materials.
- Observed: shrinking randomly-sampled tesserae leaves **negative space** (random
  points don't tile). This motivated the occupancy approach below.

### M5b — Occupancy & Opacity (adaptive sparse voxels)
- [x] `examples/tessera-occupancy.html` — tile the surface with a voxel grid;
      **subdivide a tessera into an N³ cube of sub-tesserae** where detail is
      needed. Each cell's **opacity = surface coverage** (empty → 0, full → 1),
      so the form stays contiguous (no random gaps) and edges blend softly.
- [x] **Multi-level detail** (1–4 levels) from a detail field (surface curvature
      or height), with dithered level boundaries — detail ramps across several
      levels instead of a binary coarse/fine split.
- [x] **Coverage scalar → material**: drive alpha, a colour ramp (tint, a
      stand-in for material quantity), or solid.
- [x] **Interlocking primitives per cell** — each cell picks a primitive from
      its 6 face-neighbour occupancy (flat → rounded cube, edge → sphere, tip →
      diamond), so the surface reads as varied interlocking pieces rather than
      stacked cubes. One InstancedMesh per shape family (≤3 draw calls).
- [x] **Composite cell** — one tessera = a centre sphere + 8 corner diamonds
      that nest into it (parts interlocking *within* a cell, the 3D version of
      "circle inscribed in a square + corner fills"); corners can carry a
      separate accent material → previews the base + accent face-plate idea.
- [x] **Joined cells** — rounded-box tesserae linked by bowtie/hourglass
      connectors across shared faces (interlocking joints, per sketch). Read as
      protruding pegs rather than joints; superseded by the packed approach.
- [x] **Packed cells (complementary two-shape)** — spheres at cell centres + a
      concave star "plug" nested into the negative space where spheres meet
      (the interstitial shape of sphere packing). True complementary interlock.
- [ ] **Material recipes + careful edges** (next) — assign skin / hair / cloth /
      boots by region with per-material colour & finish, and **boost detail at
      material boundaries** so seams like a hairline stay crisp.
- [ ] Refine toward full marching-cubes corner classification + oriented pieces
      if the neighbour-count heuristic proves too coarse.
- [ ] Decide whether occupancy+opacity becomes the base representation (vs. point
      sampling). Natural substrate for optical blending; animate via bind-pose
      voxelization + bone skinning of cells.

### M6 — Optical Blending (only after M5)
- [ ] `examples/optical-blend-face.html` — compare flat-color voxels
      (1 voxel = 1 color) vs. tesserae (1 tessera = base color + accent + shape +
      material), with near→far zoom, to test whether optical blending yields a
      stronger *perceived* image. The Chuck Close-inspired face-plate system.

### M7 — Perception Engine (the paradigm shift)
> Tesserae-Engine is **not a voxel renderer** — it is a perception-driven engine.
> See [perception-engine.md](perception-engine.md). Prioritize prototypes that
> test intelligent, adaptive tesserae over polishing voxel demos.
- [x] **Importance-driven rendering** — `examples/importance-tesserae.html`:
      build an importance map (curvature + semantic region), allocate tesserae by
      importance (dense+small where it matters), per-tessera **faceplate glyph**
      by importance band, and a **continuous abstraction** slider (1%→100%).
- [x] **Colour from source + combined preview** — `examples/tessera-preview.html`:
      sample each mesh's albedo texture per tessera (interpolated UV → texel,
      sRGB-decoded) so tesserae take the model's **real colours**, combined with
      importance-driven density/size, faceted bodies, colour faceplates, and the
      continuous abstraction slider in one page. Neutral white lighting (no blue
      cast). The step that turns abstract fields into a recognisable likeness.
- [x] **Primitive vocabulary as material language** — `examples/tessera-materials.html`:
      each material is a recipe of primitive shape + faceplate + finish (skin =
      lens + pores, metal = cube + rivets, cloth = pebble + weave, hair =
      capsule, glass = translucent lens, stone = pebble + cracks), applied whole
      (explore) or mixed by region.
- [ ] Tessera **families** with dedicated plug pieces that completely fill space.
- [ ] **Connection grammar** (ports + signatures) + Affinity Matrix; grow
      assemblies rather than place isolated pieces.
- [ ] **Adaptive per-tessera decisions** — subdivide / grow / change primitive /
      become bridge / corner / plug / rotate / swap faceplate.
- [x] **Solid volume + transparency by accumulation** — `examples/tessera-volume.html`:
      voxelize the surface, **flood-fill the exterior**, treat everything else as
      solid (no more hollow shell, no gaps), and render semi-transparent so thin
      regions read translucent and thick regions accumulate to opaque. The two
      answers to the hollow-shell problem are space-filling (`packed`) and this.
- [ ] **Stem tesserae & matter** — differentiate material/state; phase changes;
      transparency by accumulation over a real density field; inside-out growth.
- [ ] **Growth blueprint** — infer structure and grow a plausible object from a
      procedural description rather than copying the mesh.
- [ ] **Viewer-adaptive** importance field (head position / distance).

### M8 — The Mosaic Rethink (ground-up)
> The word *tessera* named the answer all along: a **mosaic**. Real mosaics solve
> every problem the earlier prototypes fought one at a time — tiles cut smaller
> where detail matters (adaptive), laid flush without overlap (tiling), separated
> by deliberate grout seams (the gap, designed), each with its own colour/finish.
- [x] `examples/tessera-mosaic.html` — **a tessera is a leaf of an
      importance-driven octree.** Cells subdivide where importance is high
      (source-colour variance + curvature + semantic region, with force-splitting
      of cells that wrap curved forms); octree cells nest flush across sizes, so
      overlap is impossible by construction; each leaf renders as an inset
      rounded tile oriented to the surface in source colour; grout = the inset
      seam; abstraction = tree depth (always three tile-size classes, ~4× spread,
      like real mosaic work). One instanced draw call. Iterated to a coherent
      full-colour likeness via the render harness.
- [x] **Painted tiles** — each tile is a small painting: base colour (cell mean)
      + two accent colours (the most divergent source colours inside the cell),
      applied as glyph shapes chosen by a heuristic material read of the tile
      (gold → hammered facets, skin → pores, cloth → weave, dark → strands) via a
      mask atlas + per-instance palette in the shader (still one draw call).
      Up close the shapes read as material texture; at distance they optically
      blend back into the base (the Chuck Close effect). COLOUR=material debugs
      the classifier; PAINT toggles painted vs flat.
- [x] **True optical blending (divisionism / Seurat).** PAINT gained a `pure`
      mode: the tile contains **no pixel of the target colour** — two
      fully-saturated hues (warm + cool bracket of the target hue, lightness
      matched to the target so the equation stays in gamut) cover most of the
      tile via the material glyph masks, and the small remaining base area is
      solved in linear light so that
      `coverage_A·A + coverage_B·B + coverage_base·Base = target` exactly,
      using each mask's real measured pixel coverage (`PAT_COV`). The target
      colour exists only in the eye, at distance — verified in the harness: up
      close (5%) tiles show vivid pure pigment patches; from a normal view
      (100%) they resolve back into the correct gold/skin figure. Densified all
      four glyph patterns (~45–60% combined accent coverage, was ~5–30%) so
      purity is visible on every material, not just cloth. `muted` (softer,
      source-derived accents) and `flat` remain as the other PAINT modes.
- [x] **SPLIT control — push complementary colours toward Chuck Close's
      extremes.** classic / bold / extreme scale how far the two pure hues are
      pushed apart around the target hue (was fixed at a narrow ~18°). Default
      is now `bold`. Verified two ways: (1) at 5% the patches read distinctly
      more vivid/jarring than `classic`; (2) rendered at full resolution, then
      genuinely downsampled (cropped + bilinear-shrunk + re-expanded, not just
      trusting the per-tile maths) to simulate viewing from a distance — the
      figure resolves to the correct warm gold, confirming the optical
      neutralization actually works and isn't just colour-correct on paper.
      Honest finding: `extreme` (±86°, near-true-complements) hits the sRGB
      gamut wall for many hue/lightness combos and silently falls back toward
      the target colour more often than `bold`, so in practice it often reads
      only marginally bolder than `bold` rather than dramatically more so —
      logged as a known limit rather than oversold.
- [ ] **Portrait model — reverted, 404'd on device.** Tried `facecap.glb` from
      the mrdoob/three.js CDN; confirmed failed on a real device. Root cause
      likely unfixable by guessing again: outbound network from this sandbox
      is policy-blocked entirely (verified — even a metadata HEAD request to
      `data.jsdelivr.com` gets a 403 at the gateway), so no external URL can be
      checked here before shipping it. There's also a second, independent risk
      specific to that repo: three.js's example binaries may be stored via Git
      LFS, which jsDelivr's GitHub-CDN proxy does not resolve — it would serve
      the LFS pointer text file instead of the model, failing glTF parsing
      regardless of path correctness. Removed from MODELS pending either (a) a
      user-supplied face/portrait `.glb` hosted locally like `empress.glb` (the
      only approach proven reliable so far), or (b) a differently-sourced
      candidate the user wants tried next.
- [ ] Improve the material read (true material IDs / metalness sampling — the
      colour heuristic misreads shadowed gold as cloth/dark) and add per-tile
      pattern rotation so glyphs don't all align.
- [ ] Andamento — orient/flow tiles along contour or colour-gradient lines (the
      signature of hand-laid mosaic; currently tiles are axis-aligned in-plane).
- [ ] Merge the faceplate/relief language and material recipes onto mosaic tiles.
- [ ] Animate: bind leaves to bones (bind-pose octree + skinning, as in
      tessera-avatar).

## Backlog

- Raw WebGL2 renderer — **deferred**. Three.js instancing is already close to
  the metal; revisit only if benchmarking proves library overhead is the
  bottleneck (vs. instance count / fragment shading / glyph generation).
- Face plates, materials, glyph generation beyond reconstruction.
