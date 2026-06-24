# Roadmap

> Planned milestones and features for Tesserae-Engine.

## Milestones

### M0 — Foundations
- [ ] Repository structure and documentation scaffolding
- [ ] Project tooling / build setup

### M1 — Performance Proof
- [x] `examples/primitive-cloud.html` — GPU-instanced primitive benchmark
- [x] Animate Tesserae toggle — measure GPU + per-instance animation cost (VRM-avatar question)
- [ ] Measure max tesserae (static **and** animated) on M-series Mac, gaming PC, iPad Safari
- [ ] Target: ~100k tesserae smooth on iPad Safari, ~500k+ on desktop

### M2 — Geometry Reconstruction
- [x] `src/geometry/` — SurfaceSampler, TesseraGenerator, SpatialLOD
- [x] `examples/glb-sampler.html` — GLB → 10k/25k/50k surface tesserae
- [ ] Validate reconstruction fidelity across a few standard models
- [ ] `examples/tessera-avatar.html` — sample a VRM/avatar mesh into Tesserae

### M3 — Continuous Abstraction
- [ ] Abstraction slider (1% → 100%) driven by `SpatialLOD` cell size
- [ ] Tie face-plate complexity, glyph density, and optical blending to abstraction
- [ ] See [continuous-abstraction.md](continuous-abstraction.md)

## Backlog

- Raw WebGL2 renderer — **deferred**. Three.js instancing is already close to
  the metal; revisit only if benchmarking proves library overhead is the
  bottleneck (vs. instance count / fragment shading / glyph generation).
- Surface sampling, face plates, optical blending, materials beyond the
  first reconstruction milestone.
