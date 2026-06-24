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

## Backlog

- Raw WebGL2 renderer — **deferred**. Three.js instancing is already close to
  the metal; revisit only if benchmarking proves library overhead is the
  bottleneck (vs. instance count / fragment shading / glyph generation).
- Face plates, materials, glyph generation beyond reconstruction.
