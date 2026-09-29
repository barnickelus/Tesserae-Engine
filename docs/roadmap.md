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
- [x] **Portrait model — fixed via the reliable path.** The CDN guess
      (`facecap.glb`) 404'd, as expected given this sandbox can't verify
      external URLs. Replaced with a user-supplied face/portrait `.glb`
      (`examples/models/portrait.glb`, "Emerald Gaze in Shadow"), hosted
      locally exactly like `empress.glb` — same-origin, so it's guaranteed
      reachable and its texture is canvas-readable. This time genuinely
      verified in the render harness (not guessed): loads as
      `Portrait · tex 1/1`, and orbiting confirms a real head/shoulders bust
      with the divisionist painting rendering correctly on it.
      Also found and fixed a real bug this surfaced: switching models while a
      large default model (Empress, 24 MB) was still loading could let the
      slower, earlier-started load finish *later* and silently clobber the
      newer selection. Fixed with a load-generation counter in `loadModel()` —
      a stale completed load is now dropped if a newer one has since started.
      Known cosmetic-only issue: the default camera angle doesn't face this
      scan's front (its forward axis doesn't match the generic framing
      assumption) — orbiting on-device finds the face instantly since that's
      interactive, unlike the slow scripted verification here under software
      rendering.
- [x] **Colour sampler replaced — ground-truth GPU bake instead of manual
      UV reading.** User feedback on the live Portrait render: "much of the
      face is blacked out. Not much color intensity or variation." Root
      cause: `portrait.glb`'s Meshy multi-view-baked atlas has large black
      *background* patches between its per-view islands — not seams, whole
      dead zones — and sampling a single UV point per triangle (even the
      gutter-safe centroid used for Empress) frequently landed in one, even
      though the model renders correctly on screen (confirmed by rendering
      it plainly, no tesserae — full natural skin tone, legitimately dark
      hair/top, no holes). So the manual reader — which has to independently
      get flipY convention, atlas gutters, sRGB decode, and multi-material
      handling all correct — was the fragile part, not the asset.
      Replaced it: `bakeSurfaceColors()` renders the actual textured model
      unlit from 14 orthographic directions (cube faces + corners) into an
      offscreen target and reads colour straight off the rendered pixels;
      `sampleBaked()` picks the most head-on unoccluded view per surface
      sample (facing check + alpha-hit test). This reuses the GPU's own
      correct rendering — the same pipeline already verified visually
      correct — instead of re-deriving it by hand. `buildSampler` no longer
      touches UV/texture data at all (positions/normals only); the HUD label
      now reports bake coverage (e.g. `Portrait · 100% covered`, was ~25%
      real colour / ~75% black before the fix, verified via the harness).
      No regression on Empress/Fox/Human/Helmet (still 100% covered, clean
      renders).
- [x] **Multi-shape tiles, an RGB divisionist mode, and idle/cursor motion +
      blinking.** User feedback on Portrait (post-bake-fix): fine detail near
      the lips got blocked in too roughly ("mosaics aren't just squares"),
      colours/patterns needed pushing further ("more colors in each tile...
      could you get at least cmyk or rgb and just use the correct
      proportions"), and asked to wire the bust up to move/interact.
      **Shapes**: leaves are bucketed into BLOCK (default), SLIVER (elongated,
      rolled to align with the local tangent — andamento, the traditional cut
      for lips/eyelid contours — chosen where importance is high), and WEDGE
      (triangular prism, scattered roll — chosen where curvature wraps too
      tight for a flat block, e.g. nostril/ear rim). Each shape is its own
      InstancedMesh sharing one material (draw calls = active shape count,
      2–3 typically), so this is still a small, fixed number of draw calls,
      not one per tile.
      **RGB mode**: a mosaic mixes reflected light *additively* (like a
      screen's RGB subpixels), not subtractively (that's CMYK, for ink) — so
      the exact in-gamut decomposition of any colour into pure R/G/B is
      trivial: coverage_R/G/B = target's own linear r/g/b. Reasoned through
      explicitly rather than silently picking one, since the user offered
      either — CMY alone goes negative (out of gamut) for saturated single-
      channel colours under an additive model, so RGB is the physically
      correct choice here. Implemented as three independent per-instance
      noise-threshold dithers (one per channel) that statistically overlap
      and add. First attempt used a mipmapped noise texture and came out as
      solid colour blotches per tile, not a fine dither — mipmapping a random
      field collapses it to ~flat grey at any minification, turning a
      per-pixel stochastic threshold into a near-binary per-tile decision.
      Fixed with NearestFilter + no mipmaps; verified both visually (fine
      RGB speckle, not blotches) and by downsampling the render (resolves to
      a correct natural skin tone).
      **Motion**: the bust has no skeleton (a static sampled point cloud), so
      idle motion is a rigid whole-model sway/bob, and "look at cursor"
      rotates the same group toward the pointer — both pivot at the model's
      own centre (tile positions are stored relative to it). Blinking
      flattens the eye-band tiles' in-plane scale briefly; purely geometric,
      so it reads the same across every PAINT mode. Eye-band leaves are
      detected heuristically by head-relative y-fraction + horizontal
      centrality — works for front-facing busts, not guaranteed for arbitrary
      models (Fox/Helmet may flag an unrelated band; harmless).
      No regression across pure/muted/flat/rgb × source/importance/material
      colour modes, verified via the harness.
- [x] **Real skeletal skinning for Fox/Human/Soldier, and a coarser "blobs"
      RGB variant.** User feedback on the whole-model idle sway: "it really
      isn[']t done right or relevant to the anatomy." Right call — the
      static-bust idle motion is a single rigid rotation of the whole model,
      which is a reasonable stand-in for a model with no skeleton at all, but
      wrong for something that has one.
      **Skinning**: ported the technique already proven in `tessera-avatar.
      html` — sample in BIND-POSE space (via `bindMatrix`, not `matrixWorld`)
      with each sample's dominant-vertex skin indices/weights carried through
      (`buildSampler` → `drawSamples` → one representative binding per
      octree leaf in `buildMosaic`), then re-skin every tessera's position
      each frame from the skeleton's live bone matrices (`updateSkin()`) —
      same maths as GPU skinning, run on the CPU into instance matrices.
      Went one step past tessera-avatar's own scope, which explicitly keeps
      tile orientation frozen at bind pose ("architecture test = attachment,
      not polish"): here each tile's orientation is ALSO rotated by its
      dominant bone's rotation delta since bind pose, precomputed once per
      bone per frame (not per tessera — cheap) via `computeBoneDeltas()`, so
      tiles on a bending limb actually tilt with it instead of pointing their
      bind-pose direction forever regardless of pose. Fox and Human (Cesium
      Man) already had skeletons + clips and needed no new asset; added
      Soldier (Mixamo-rig sample from the same three.js CDN path already
      proven working in tessera-avatar.html) as a third. CLIP buttons switch
      animation clips, mirroring tessera-avatar's UI.
      Known gap: could not exercise the actual bone-driven motion in this
      sandbox — Fox/Human/Soldier are all external CDN URLs, and the render
      harness (`tools/render.mjs`) substitutes a local static stand-in for
      any non-localhost `.glb` precisely because this sandbox has no general
      internet access, so `isSkinned` never goes true under test here. What
      *was* verified via the harness: no regression on the static models
      (Empress/Portrait) across all PAINT/COLOUR combinations, since
      `buildSampler`/`buildMosaic`/`buildShapeMesh` are shared code paths
      touched by this change. The skinned path needs verification on-device.
      **blobs**: the user liked `rgb`'s fine per-pixel vibration (explained
      why it happens: NEAREST-filtered true white-noise dithering means any
      sub-pixel camera motion shifts which discrete texel a screen pixel
      lands on, and adjacent texels are uncorrelated by construction — the
      classic "dither crawl" artifact) and asked for a second variant with
      larger colour shapes, current `rgb` left untouched. Implemented by
      reusing the identical technique at a much lower noise-texture repeat
      count. First attempt (5x fewer repeats) showed no visible difference —
      turned out the noise was still landing at roughly one texel per screen
      pixel either way, so "fewer repeats" alone didn't change the apparent
      dot size until pushed much further (25x fewer repeats): verified via
      tight pixel-level crops comparing the two side by side, and confirmed
      it still downsamples to the correct skin tone at a distance.
- [ ] Improve the material read (true material IDs / metalness sampling — the
      colour heuristic misreads shadowed gold as cloth/dark).
- [ ] Merge the faceplate/relief language and material recipes onto mosaic tiles.
- [ ] A from-scratch original avatar (not a scanned model) as a Claude
      persona/interface, built on this same tessera system — bigger, separate
      follow-up; explicitly deferred by the user in favour of animating the
      existing Portrait bust first.
- [x] **Debugged the Soldier skeletal-animation report ("didn't load right,
      look very blobby") and shipped two real fixes.** Since Fox/Human/
      Soldier are all external CDN URLs and this sandbox has no general
      internet access, this couldn't be reproduced against the real asset —
      built `tools/test-rig.glb` instead: a tiny 2-bone rig generated
      entirely offline (three.js constructs the mesh/skeleton/clip directly,
      `GLTFExporter` writes the file — see `tools/make-test-rig.mjs`), giving
      a known ground truth to run the real code path against. Also verified
      the position/rotation-blend formula in complete isolation (plain Node,
      no browser) against a hand-computed expected result.
      Both checks passed — the algorithm itself is sound. The reason the
      synthetic rig *looked* unbent in the first several checks turned out to
      be viewing-angle coincidence (a bend along the camera's view axis reads
      as foreshortening, not a visible swing — confirmed by forcing a side-on
      camera angle, where the bend was clearly visible).
      That investigation surfaced one real gap, now fixed: tile ORIENTATION
      was rotated by only its single most-dominant bone. Fine for a 2-bone
      test rig, but on anything with more joints, neighbouring tiles can sit
      on opposite sides of a dominant-bone tie (51/49 vs. 49/51) and snap to
      different orientations right at that boundary — reading as a jumbled,
      blobby surface even with correct positions, exactly matching what was
      reported for a many-boned rig like Soldier. Replaced with a proper
      weighted blend across all four bone influences (`blendedDeltaQuat()`),
      handling the quaternion double-cover sign flip so weighted-averaging
      doesn't cancel opposite-signed-but-equal rotations. Also added
      `instanceMatrix.setUsage(DynamicDrawUsage)` on skinned meshes (matches
      tessera-avatar's own practice; likely a no-op on modern GPUs but a
      correct hint for a buffer that's rewritten every frame).
      Still can't verify against the real Soldier/Fox/Human assets from this
      sandbox — asked the user to re-test on their device and report back,
      and to also check Fox/Human (simpler, single-mesh, well-worn sample
      assets) as an additional data point.
- [x] **Found and fixed the actual Soldier bug: a coordinate-space mismatch,
      not the animation math.** User confirmed Soldier was "still a blob"
      after the orientation-blend fix above, this time with a screenshot
      showing `Soldier · 0% covered` in the HUD and a round, featureless
      silhouette with no visible limbs — a genuinely new, much more specific
      clue than "blobby." 0% bake coverage meant every single sample failed
      to hit any of the 14 bake cameras, and a round silhouette meant the
      octree was partitioning a shape that wasn't the T-pose at all.
      `test-rig.glb` (origin-centered) couldn't have caught this — it hid
      the bug by construction. Built `test-rig-offset.glb`
      (`make-test-rig-offset.mjs`): the same 2-bone rig, but parented under a
      Group with a real position + rotation, i.e. how an actual authored
      character sits (never at the world origin with identity rotation).
      This reproduced `· 0% covered` and a garbled shape exactly.
      Root cause: `buildSampler` sampled skinned parts by applying
      `bindMatrix` — which is IDENTITY for glTF assets by spec convention
      (no separate "bind shape matrix" concept), i.e. raw LOCAL vertex
      space — while `center`/`radius` (from `Box3.setFromObject`) and the
      bake cameras are computed in WORLD space (`matrixWorld`). For a mesh
      sitting at the origin with no rotation, local space and world space
      coincide, so `test-rig.glb` never exposed the mismatch. For an
      off-origin, rotated armature — i.e. any real character — the two
      spaces diverge entirely, and samples land nowhere near where the bake
      cameras or octree math expect them.
      Fixed by always sampling in WORLD space (removing the bindMatrix/
      matrixWorld branch in `buildSampler` entirely — one code path for
      skinned and static parts alike), and recovering the bindMatrix-space
      position the per-frame skinning formula needs via a single
      precomputed correction matrix (`skinCorrection = bindMatrix ⋅
      matrixWorld⁻¹`, derived from the fact that bindMatrix is applied
      exactly once forward and once back across the full skinning
      equation, so any consistent choice of intermediate space works —
      applied once per leaf per frame in `updateSkin()`, not per bone).
      Verified against `test-rig-offset.glb`: bake coverage went from 0% to
      66% (a flat box at an off-axis rotation relative to the 14 fixed bake
      directions won't hit 100% regardless — expected, not a bug), the
      correct bent arm shape rendered with real colour, and Empress/Portrait
      showed no regression (buildSampler's transform is now simpler, one
      path instead of two).
      This is very likely THE actual cause of the original Soldier report —
      `test-rig.glb` alone gave false confidence the algorithm was fully
      fixed when it had only ruled out one class of bug. Still can't verify
      against the real Soldier/Fox/Human assets directly (no network access
      in this sandbox) — asked the user to re-test.
- [x] **Real head-turn for Portrait/Empress/Helmet ("puppet the portrait —
      have it look around and move her head").** Previously the only motion
      for non-skinned models was the whole bust rigidly swivelling toward
      the cursor — not anatomically real, and not what was asked for.
      The top ~55% of leaves (`isHead`, broader than the existing eye-band
      heuristic) now rotate independently around a neck pivot computed once
      per model (`headPivot`, in `buildMosaic`), composed on top of the
      body's existing small breathing sway rather than replacing it — a
      real head turn, torso stays put. Two behaviours:
        · autonomous idle glancing — a slow random-target state machine picks
          a new gentle look direction every 1.6–4s and eases toward it, so
          the bust looks subtly alive on its own.
        · "look at cursor" — same head-turn mechanism, now driven by cursor
          position instead of the random state machine.
      Blinking (previously its own `eyeLeaves`/`updateBlink`) is merged into
      the same per-frame pass (`updateHeadAndBlink`) since both act on
      overlapping leaves and both need to compose with whatever the head is
      currently doing, not the static bind pose.
      Verified via the harness: moving the mouse to the left/right/top edges
      produces a clean, correctly-directed head turn with the shoulders
      staying fixed (screenshots compared side by side). The autonomous
      glance timing itself was hard to directly verify in this sandbox —
      software-rendered FPS is so low (1–7fps) that per-frame `dt` hits its
      0.1s clamp almost every frame, stretching multi-second idle-state
      timers to several times their real duration — but the cursor-driven
      test exercises the identical rotation code path, which is the part
      that actually mattered to verify.
- [x] **Magnetic-stretch elasticity (MAGNET: off / soft / firm) — tiles bond
      to neighbours and stretch to bridge the gaps deformation opens.** User:
      "large gaps are left when models move... a lack of stretch that skin
      has... a magnetic weighting of the mosaic pieces to their neighbours"
      with three knobs to hone: noticeable stretch before the bond breaks;
      bonds compound so a highly-connected tile holds better / is more
      elastic. Implemented as meshless deformation on top of the rigid
      animation transform: a lazily-built nearest-neighbour graph (spatial
      hash, K=6), then per frame each moving tile accumulates a symmetric
      stretch tensor toward any neighbour that has pulled away, and the tile's
      instance matrix is composed as (rigid rotation)·(I + stretch)·(rest
      scale). Break distance scales with bond count (compounding elasticity);
      soft = elastic/skin-like, firm = stiffer/snaps sooner.
      Key correctness finding, caught by instrumenting the pass: a purely
      DISTANCE-based gap test (centre-to-centre separation) works for the
      head-turn shear seam but does NOTHING for a bending limb — bending is
      near-isometric, so neighbour centres barely separate; the gaps there
      come from rigid tiles TILTING apart (their surface normals diverging).
      Added an angular term (per-bond rest vs. current normal angle) as the
      primary driver, combined with the distance term via max(); verified
      both cases engage (head-turn: boundary tiles stretch up to ~2.4×;
      bending test rig: the bend-band tiles stretch and bridge, and at an
      extreme 90° corner the bonds correctly BREAK rather than smear a tile
      across the corner). Built a second offline rig fixture with the armature
      off-origin (`tools/test-rig-offset.glb`) and a freeze/pose debug hook to
      compare identical poses with magnet off vs. soft.
      Effect is subtle on the coarse test rigs (gap-per-tile scales with tile
      size × tilt angle, so it reads best at fine abstraction) — the three
      gains (strength / angular / break) are exactly the "fine tune and hone
      in" knobs the user called out, exposed as soft/firm presets for
      on-device evaluation at 100% abstraction / 60fps.
- [x] **Fascia upgrade to MAGNET: bonds now DRAG tiles, not just stretch
      them.** User feedback on the first magnet version: it wasn't "really
      acting like skin or fascia" as hoped. Correct diagnosis of a structural
      limitation — each tile only scaled itself toward departed neighbours,
      reacting alone; real skin is a connected sheet under tension where a
      pull in one place drags a whole band of material along, distributing
      strain across a gradient. Added a position-based-dynamics relaxation
      pass (applyMagnet pass 2): per frame, every moving tile starts at its
      animation-driven target, then the bond network is relaxed `iters` times
      — each over-stretched bond pulls its tile partway back toward the
      neighbour (half-weight vs. co-moving tiles, near-full vs. static
      anchors, which won't meet it halfway). Each iteration diffuses the lag
      one bond-hop deeper, so an N-iteration relax forms an ~N-tile-wide
      strain band — the skin/fascia gradient. The stretch pass then bridges
      only the RESIDUAL strain relaxation couldn't absorb, reading positions
      from the relaxed state. Stateless per frame (re-seeded from the
      animation every time): no drift, no lag once strain is gone, and broken
      bonds re-latch automatically when back in range — magnets, not welds.
      soft = supple (lower stiffness, more iterations, strain spreads wide),
      firm = taut (transmits pull harder, snaps sooner).
      Verified via the harness on the Portrait head-turn held hard left:
      with `off` a clean shear seam at the neck; with `soft` the neck/jaw
      band visibly drags partway with the turn, distributing the strain. At
      the test's coarse 20% abstraction the band is proportionally wide
      (band width is measured in tile-hops); at 100% on-device it reads as a
      tighter gradient. Cost is O(tiles·K·iters) ≈ 120k adds/frame at 5k
      tiles — negligible at real frame rates, though it visibly costs FPS
      under the harness's software renderer (1fps vs 4fps — not meaningful
      for device performance).
- [x] **Fascia round 2: compression push-back + orientation drag.** Two
      refinements on top of the relaxation pass:
      · deep compression now pushes back (with a dead zone of 0.18 tile-
        widths so resting contact doesn't jiggle) — bunched tiles resist
        piling into each other, a light volume-preservation effect;
      · a tile the fascia dragged away from its animated target also SLERPS
        partway back toward its rest orientation, proportional to drag
        distance — the strain band twists gradually between the moving
        region and the anchors instead of lagging in position while still
        carrying the full head rotation (which read as a sheared, twisted
        band). Rest orientations are captured per tile at build time
        (mgRestQ, filled in buildShapeMesh).
      Verified: neck band drags and twists smoothly on the hard-left head
      turn; no regression on the default load.
- [x] **Fascia round 3: rest-pose seeding bug + hot-loop perf.** Found by
      re-reviewing the implementation: the neighbour graph seeded its "rest"
      distances from `mgCurC`, but the graph is built lazily on the FIRST
      frame with the magnet on — by which time the animation paths have
      already overwritten `mgCurC` with posed positions. Toggling the magnet
      mid-animation (mid-head-turn, or on an always-animating skinned model —
      i.e. the normal way anyone uses the button) baked that deformed pose in
      as "rest", permanently mis-tensioning every bond. Fixed with a
      dedicated `mgRestC` captured at build time and never overwritten; the
      graph now reads it exclusively. Also swapped `Math.hypot` for
      `Math.sqrt` in the two per-frame bond loops (~4x faster per call,
      ~500k calls/frame at 100% abstraction with iters=4). Verified on the
      neck test, which happens to exercise the exact bug scenario (magnet
      toggled while the head is held hard-left): band drags correctly from
      true rest; default load regression-free.
- [x] **Fascia round 4: "bond the way atoms do" — persistence, reciprocity,
      compliant anchors.** User's marked-up on-device screenshot (100%
      abstraction, firm, head turned) showed exactly what was still wrong:
      big open rifts tearing across the neck/chest, plates of tiles
      separating like continents. Three physics gaps mapped to it:
      · no reciprocity — bonds only pulled the MOVING tile; the static side
        never gave. Newton's third law now applies: bond corrections move
        both ends (Gauss-Seidel, half each), and the "static" tiles a bond
        touches join the lattice as COMPLIANT ANCHORS — draggable a little,
        with a strong dt-scaled spring back to rest (the chest pulls up
        slightly when the head turns). Their matrices are now written per
        frame too, and restored to rest when the magnet switches off (the
        animation paths never rewrite them).
      · no persistence — positions were re-seeded from the animation every
        frame, so strain could only propagate `iters` bond-hops per frame;
        it piled up at the moving/static boundary until those bonds snapped
        into one giant fissure. The sim positions now PERSIST between frames
        with a per-second anchor spring toward the target: strain keeps
        propagating across frames like a real lattice relaxing, iters could
        drop (4→3 soft, 3→2 firm — a perf win at the same time), and a
        released region springs back over a few frames instead of popping.
      · bonds gave up too early — breakBase raised (1.1→1.4 soft,
        0.55→0.85 firm) since distributed strain means each bond individually
        stretches less before the lattice as a whole absorbs the motion.
      The user's screenshot also showed 19fps at 19.7k tiles with firm on
      (vs 60 with magnet off) — the iters reduction plus the earlier
      hypot→sqrt swap are the perf levers applied; worth re-measuring
      on-device.
      Verified: hard-left neck test shows the lattice holding together —
      band drags, no rift; magnet-off restores statics; default load
      regression-free.
- [x] **Fascia round 5: force COMPOUNDING — "grab skin and pull".** User
      (with circle-mosaic portrait references and a hinged Victorian Masonic
      pendant as the connected-tiles metaphor): "there's a little pull and
      movement with magnetism, but either the bond isn't strong enough or
      the neighbouring tiles aren't enough — there's no compounding of
      force," contrasting with real skin, where grabbing a pinch recruits a
      wide patch of surrounding tissue. Two structural causes found:
      · bonds only existed on MOVING tiles, so the recruited skirt was
        exactly one bond-hop wide — force literally could not compound
        deeper. Bonds are now built for EVERY tile, and the lattice recruits
        statics via multi-hop BFS through the bond graph (RING=4 hops); the
        whole recruited patch participates fully in relaxation AND the
        stretch pass (unified code path — recruited statics' mgCurC/mgCurQ
        hold rest, so the same loop treats them uniformly).
      · anchors dominated bonds — every tile was yanked to its target so
        hard that bond pull barely accumulated. Rebalanced so bond cohesion
        dominates (stiff 0.85–1.0, anchors cut ~2.5x): skin is strongly
        bonded to itself, only loosely attached to the bone underneath. The
        weaker animation anchor also adds a natural viscous lag (secondary
        motion) — the sheet settles into a pose rather than teleporting.
      Verified off-vs-soft on the hard-left turn: the whole neck/collar/
      upper-chest patch is now recruited and follows as one connected sheet,
      vs. the one-tile skirt before. Note: bonds-for-every-tile roughly
      doubles graph-build cost (still lazy, once per rebuild) and the
      lattice loop covers moving+ring rather than moving — partially offset
      by the earlier iters cuts; re-measure FPS on-device.
- [x] **`lit` PAINT mode — real-time scene light baked into the divisionist
      colour ratio instead of a white sheen.** User: "instead of adding a
      sheen... add the real time sheen into the pattern colour ratio of the
      tile." Added a sixth PAINT mode: the same pure-divisionist tile (base +
      two pure accents through the glyph mask), but the fragment shader reads
      the key light's view-space direction (a uniform refreshed each frame as
      the camera orbits) and shifts the accent COVERAGE by it — a brighter-lit
      tile expands its warm accent, a shadowed one its cool accent — so a
      highlight reads as more warm tesserae rather than a foreign white gloss
      (the painterly warm-lights/cool-shadows convention). The material's own
      specular is killed (roughness 1) so the colour shift is the only sheen.
      Verified on Portrait: the light-facing cheek reads visibly warmer/pinker
      than the shadowed side, vs. the uniform hue of plain `pure`; no
      regression on pure/muted/flat/rgb/blobs.
- [x] **`tessera-world.html` — a navigable, algorithmically generated world,
      with an avatar Claude designed for itself.** User, after the fascia
      work: the magnetic system worked fine wherever the underlying rig made
      reasonable demands of skin — Portrait's crude joint, not the physics,
      was the real source of the "unnatural" feel — then: "you, claude,
      could build your own avatar to speak with. We could create a 3d
      three.js navigable algorithmically generating world." New prototype:
      · Terrain is a seeded fractal value-noise heightfield, a pure function
        of (x, z, seed) — no stored heightmap. Chunks of tesserae stream in
        around the player and dissolve behind, mirroring the octree-tile
        philosophy applied to open terrain. Biomes (shore/meadow/forest/
        talus/snow) read from height + a second moisture field, with the
        same hand-cut HSL jitter tessera-mosaic uses so runs of one colour
        still read as laid tiles. Water is the one continuous, skin-less
        surface in the world — everything else is discrete tesserae.
      · Claude's own avatar: an honest, non-human silhouette (terracotta
        tesserae, an ovoid head with blinking amber-tile eyes, a pulsing
        coral "thinking" core, a tapered floating base instead of imitation
        legs) built with a clean neck-pivot rig — deliberately not reverse-
        engineered from a scan — that tracks the player, glances away while
        "idle," and speaks proximity-triggered lines. Those lines are
        scripted, not a live model call: documented in-file as an honesty
        constraint, since a static GitHub Pages page can't hold an API key.
      · Follow-up ask: "make a realistic human avatar to navigate around the
        world" + "will you be able to alter code in the world through the
        avatar?" Added a second, player-controlled avatar resampled from the
        `empress.glb` scan already used by tessera-mosaic — same triangle-
        area-weighted surface sampling as tessera-avatar.html's skinning
        pipeline, but rigid (no skeleton in that asset) and coloured by
        reading its own baked base-colour texture per sample UV, so it's a
        real scanned body rendered in tesserae rather than another abstract
        figure. Third-person chase camera by default (toggle to first-
        person), with a floor-clamped orbit so the camera can't dip below
        terrain when looking up steep slopes. On "alter code": answered
        honestly that live code execution from the avatar needs a backend
        holding an API key, which a static page can't safely carry — built
        the feasible version instead, an in-browser builder mode (click
        removes the tile under the cursor, shift-click places one at the
        clicked ground point, both via InstancedMesh swap-and-shrink /
        grow, no server round-trip).
      Verified headless: zero page errors across load, chunk streaming,
      avatar speech trigger, third-/first-person toggle, and builder-mode
      add/remove, using a local `three@0.160.0` vendor copy (the CDN import
      map is swapped at test-serve time; the shipped file still points at
      unpkg for production).
- [x] **`tessera-mosaic.html` — Michelle: a clean, full-colour, animated
      human model.** User: the existing Portrait scan is too low quality;
      asked for a better one, ideally already riggable for movement. Added
      Michelle.glb — three.js's own example asset (same family as the
      already-wired Fox/CesiumMan/Soldier), with a real baked photo texture
      and real skeletal animation (SambaDance), instead of another static
      scan.
      Loading it surfaced a real bug, not just a missing feature: a
      freshly-parsed GLTF scene, never yet added to a live scene graph, can
      still carry construction-time identity matrixWorld on nested
      ancestors — `Box3.setFromObject`'s own internal per-node
      `updateWorldMatrix(false,false)` calls aren't a reliable substitute
      for a fresh, never-rendered hierarchy. That gave a garbage-scale
      bounding box specifically for Michelle's deeper rig (Character/Ch03
      wrapper) — Fox/CesiumMan/Soldier's flatter hierarchies happened not
      to expose it. Symptom was deceptive: tiles built, the colour bake
      even reported ~99% "covered," but the actual render was a handful of
      stray fragments, because the camera was framed for an object roughly
      100x smaller than what was actually drawn. Fixed with one explicit
      `gltf.scene.updateMatrixWorld(true)` before measuring.
      That alone corrected tile POSITION but not tile SIZE (set once from
      the octree cell size, in the same pre-fix coordinate convention) or
      the magnetic-fascia system's rest state (which read the sudden
      100x jump to true scale as an already-catastrophic stretch and
      yanked the whole mosaic back to build-time scale the instant the
      magnet turned on). Fixed both: tile size via a global ratio against
      the now-correct Box3-derived radius, fascia rest state by re-seeding
      `mgRestC`/`mgCurC`/`mgSimC` from each leaf's actual post-skin render
      position instead of its raw bind-space sample position.
      Verified headless across Empress/Portrait/Michelle, magnet on and
      off — no regressions, zero page errors. (Fox/CesiumMan/Soldier/
      Helmet load from jsdelivr, which this sandbox's proxy blocks for
      testing — unaffected by this change, untested here for that reason
      only; they'll resolve normally on the deployed page.)
- [x] **Bust-crop view + fix a real crash at 100% abstraction + magnet.**
      User: Michelle is nice but they want a shoulders-up bust — "I want to
      see how the effects work up close, like on a speaking face" — and
      separately reported the page crashing whenever abstraction is 100%
      and the magnet is on.
      Bust crop: first tried a fixed bind-pose Y-height cutoff (top 32%,
      keep-above). Looked right on paper but broke visibly on Michelle,
      whose default clip (SambaDance) crouches and turns — a static height
      band cut through the moving body at an arbitrary point each frame,
      producing disconnected floating fragments instead of a coherent bust.
      Replaced it with a pose-invariant cut: keep only samples whose
      DOMINANT bone (by skin weight) is head/neck/shoulder/upper-spine —
      a property of the rig, not the current pose, so the crop stays
      coherent through the whole animation. New `viewCenter`/`viewRadius`
      pair (separate from `center`/`radius`, which buildMosaic's sizeFix
      and the colour bake still need at whole-model scale) frames the
      camera tight on the actual post-skin rendered extent of whatever's
      kept, measured by reading back real instance-matrix positions after
      the first updateSkin() pass rather than trusting any pre-skin
      estimate. Toggle button reloads the current model with the crop
      applied/removed.
      The crash: reproduced headless — heap stayed flat (no leak) but FPS
      decayed to 0 and stayed there, i.e. a single JS frame blocking
      indefinitely, which is exactly what trips mobile Safari's/Chrome's
      unresponsive-page watchdog into killing a tab (read by the user as
      "crashes"). CPU profiling found two unbounded per-frame costs, both
      invisible at normal tile counts and both blowing up together only
      past ~20k tiles:
      · the magnet lattice's RING-hop bond recruitment had no cap, so a
        large "moving" set (e.g. a bust's headLeaves at 100% abstraction,
        already thousands of tiles) saturates outward until nearly the
        whole mesh joins the per-frame relaxation loop;
      · the neighbour-graph build's spatial hash sizes its cell from one
        MESH-WIDE average tile size, but the octree packs tiles far
        smaller than that average into high-detail clusters (eyes,
        hairline) at high abstraction — those clusters pile thousands of
        tiles into a handful of grid cells, making the per-tile candidate
        scan + sort effectively O(cluster²).
      Added `MAX_LATTICE` (6000) and `MAX_CAND` (300) caps for both. Tiles
      a cap leaves out of the lattice now always get their rigid animated/
      skinned pose written first (previously skipped outright whenever
      magnet was on) before the lattice pass can overwrite the ones it
      keeps — so an excluded tile still tracks the animation, just without
      the extra fascia stretch, instead of freezing at a stale pose.
      Verified headless: CPU profiling confirms the capped magnet code now
      costs well under 1s total per rebuild at 100% abstraction on a bust
      (previously unbounded); bust crop toggles cleanly on/off on
      Michelle; no regressions on Empress/Portrait at default settings.

- [x] **tessera-forge — a Three.js scene you modify by describing it.**
      User wanted a page that "modifies three.js" from a prompt, working
      from a Grok sketch: a panel that sends targeted prompts to an LLM,
      which returns updated code that the frontend merges and hot-reloads.
      That framing is where this idea usually dies, so the page doesn't
      follow it. Regenerated modules are all-or-nothing — a snippet either
      runs or it takes the page down; there is no partial success, no
      validation surface, and nothing to undo, because "the previous
      module" isn't a state you can restore once the scene has drifted.
      Inverted it: the scene publishes a REGISTRY (`SCHEMA`) of ~55 flat,
      typed, dotted keys — `light.key.elevation`, `post.chroma`,
      `subject.tile`, each with a type, a range or enum, and a one-line
      description. Nothing regenerates the scene; the only thing a prompt
      ever produces is a PATCH, a small list of JSON ops against that
      registry (`set`, `nudge`, `reset`, plus `spawn`/`remove`). Every op
      is coerced and clamped per-key before it lands, an op naming a key
      that doesn't exist is reported and skipped rather than thrown, and
      the prior value of everything touched is recorded — so a patch is
      exactly invertible and a patch that is 80% valid applies 80% and
      tells you about the rest. The registry is also what generates the
      slider panel and what's handed to the model as the description of
      what it may touch, so adding a knob is one line in one place.
      Raw code survives as an escape hatch rather than the mechanism:
      `spawn` ops run generated JS inside a Group they exclusively own, so
      undoing one is removing that group. Spawns are always shown for
      review and never auto-apply.
      Two drivers, one apply path. RECIPES is a local phrase→ops table (30
      entries: cinematic, golden hour, moonlight, neon, noir, chrome, clay,
      glass, fog, film stock, wireframe, shape swaps, density, spin, lens)
      — the whole page works offline with no key, and it doubles as the
      reference for what a good patch looks like. CLAUDE mode is
      bring-your-own-key, because a static page has no server to keep a key
      in; the key stays in this browser's localStorage and goes only to
      api.anthropic.com. The model gets the registry digest plus the
      current diff-from-defaults and answers through an `apply_patch` tool
      call, with a fallback that digs a JSON array out of prose if it
      replies in text instead.
      Scene: a mosaic form (torus knot / ico / sphere / torus / cube / cone
      / a sculpted head) laid in area-weighted instanced tesserae on a
      plinth, three spherically-aimed lights, gradient sky, exponential
      fog, and a hand-rolled post chain — render target → bright pass →
      two-tap separable blur → one composite doing chroma, bloom, ACES,
      exposure, saturation, contrast, vignette and midtone-weighted grain.
      Verified headless: recipes apply and stack; undo unwinds a patch and
      everything after it back to exact prior values (confirmed returning
      to defaults after four stacked patches); the slider panel writes into
      the same history; the BYOK path was driven end to end against a
      stubbed endpoint — request shape, tool_use parsing, the spawn review
      gate, spawn execution, spawn undo, and a 401 surfacing the API's own
      message. Zero page errors.
      Follow-up, framing: the panel sits ON the canvas, so the middle of the
      window is not the middle of what you can see — on a phone it's a sheet
      over the lower half and the visible strip is under half the frame the
      camera was set up for. Two corrections, both driven by the panel's
      measured box rather than a breakpoint guess: `setViewOffset` recentres
      the frame on the visible strip, and `fitCamera` dollies out (never in,
      so it can't undo a zoom you chose) when the subject wouldn't fit.
      The first attempt at the second one used a hardcoded bounding radius
      and silently did nothing, because the guess was ~30% under the real
      value — laid tesserae extend past the source surface by lift, jitter
      and half a tile diagonal. Fixed by measuring the radius during
      buildSubject instead of assuming it, and by charging fitCamera for the
      gap between the orbit target and the subject's actual centre. Added a
      `window.forge` handle exposing `projectSubject()` so the framing is
      measured rather than eyeballed off screenshots — which is how the bad
      radius hid, since the page looked plausible and was wrong. Verified
      across phone portrait/landscape, tablet and desktop, panel open and
      closed, including a 2.4x-scaled cube (dolly 7.2 → 26.7 on phone
      portrait): all twelve cases fully inside the visible strip, centred
      within 5px. Mobile sheet also trimmed — description hidden, chips on
      one scrollable row — so it shows eight slider rows instead of three.
      Follow-up, spawn hardening + cost visibility: user was about to put a
      real key on a $5 balance into the page, which made two things worth
      checking rather than assuming. First, probing the spawn path showed
      `import()`, `fetch` and `document` all executing — the "no imports, no
      network, no DOM" line in the system prompt was an INSTRUCTION to the
      model, not an enforced boundary, and generated code could therefore
      have read `forge.key` out of localStorage and posted it anywhere.
      Fixed by passing the dangerous globals as shadowing parameters to the
      spawn's Function (fetch, XHR, WebSocket, document, window, self,
      globalThis, localStorage, navigator, Worker, …) and refusing dynamic
      `import()` lexically, since it's an operator and can't be shadowed.
      Verified all seven probes now throw and apply zero ops, while a spawn
      building meshes, a PointLight, a Points cloud, a custom ShaderMaterial
      and a per-frame updater still works untouched. Documented honestly as
      a speed bump, not a sandbox — same origin, determined code still gets
      out; the review gate is the actual control.
      Second, measured the real request instead of estimating it: 4828 chars
      of system prompt + 981 of tool schema ≈ 1.6k input tokens per prompt.
      Added a model selector (Opus 5 / Sonnet 5 / Haiku 4.5, persisted) and
      a spend readout that reads `usage` off each response and prices it
      from a list-rate table — per-patch in the log line, running total
      beside the key field. At a measured 1633 in / 880 out that's $0.0302,
      $0.0181 and $0.0060 a prompt respectively, so a $5 balance is roughly
      165, 275 or 830 prompts. Deliberately uses standard rates, so during
      an introductory discount the readout reads high rather than low.
      Follow-up, second provider: user's key turned out to be an OpenAI one,
      which the page would have rejected with a bare 401. Rather than send
      them to buy a second key, added OpenAI alongside Anthropic — cheap to
      do precisely because of the original architecture. Nothing downstream
      of the request knows which company answered: a provider only has to
      take a system prompt plus a sentence and return { ops, label, note },
      so the whole addition is a `send` function and a PROVIDERS entry. The
      system prompt, tool schema, validation, undo and patch log are shared
      verbatim (verified byte-identical across both requests). This is the
      dividend of emitting a patch instead of code — with the "regenerate
      the module" design, swapping model families would have meant redoing
      the parsing and re-tuning the prompt for a different code style.
      Anthropic uses x-api-key + the browser-access header + adaptive
      thinking; OpenAI uses Bearer auth and chat/completions function
      calling, deliberately sending no max_tokens and no temperature since
      the accepted parameter names differ across their model generations and
      a rejected parameter reads as a broken page. Model choice is a fixed
      list for Anthropic (stable ids) and free text for OpenAI (ids move —
      a stale hardcoded one fails as a confusing 404). Keys and model
      choices are stored per provider, so both can sit side by side.
      Pricing is only applied to models whose rate the page actually knows;
      for anything else it reports tokens and says "rate unknown" rather
      than inventing a figure someone might budget against. Pasting a key
      whose prefix belongs to the other provider now warns immediately
      instead of surfacing later as a 401. Verified both paths against
      stubs — headers, body shape, tool call parsing, usage accounting, the
      unknown-key warning, and per-provider persistence — plus a regression
      pass on spawn hardening and framing.
      Follow-up, the way around bring-your-own-key: user pushed back on the
      "a static page can't hold a key" line that had been repeated through
      this whole thread, and they were right — the PAGE can't, but the
      DEPLOYMENT can gain a backend, and `workers/tessera-forge-openai.js`
      (from the parallel branch) already was one: a Cloudflare Worker that
      keeps OPENAI_API_KEY as a server-side secret, pins ALLOWED_ORIGIN to
      the Pages domain, caps request size and allowlists models. It had been
      orphaned when a later commit replaced it with direct-browser mode, so
      nothing called it. Wired it in as a third provider. The browser then
      holds only a Worker URL, which is not a secret. Fits the PROVIDERS
      table without touching anything else, because a provider is still just
      "take a system prompt and a sentence, return { ops, label, note }" —
      the Worker proxies the /v1/responses body back verbatim, so proxied
      and direct replies parse through the same function. Key and endpoint
      fields are mutually exclusive in the UI, since showing the unused one
      is how a key ends up typed into a setup that never sends it. Verified:
      correct field per provider, a clear error when the URL is missing, the
      Worker receiving exactly { prompt, instructions, model, tool } with no
      Authorization header from the browser, ops applying, and — the point
      of the exercise — localStorage holding nothing matching /^sk-/ in
      proxy mode.
      Follow-up, making the Worker safe to hand a URL to: wired in last
      round, it had never actually run — and running the committed version
      in workerd (Miniflare) showed it would have been an open wallet. With
      ALLOWED_ORIGIN pinned, a request carrying no Origin header at all
      (plain curl) still went straight upstream; with ALLOWED_ORIGIN unset it
      defaulted to `*`; either way it relayed arbitrary instructions to
      gpt-5 and returned the full reply — a free general-purpose endpoint on
      the owner's card for anyone holding the URL, which the page
      necessarily publishes. Rewritten:
      · fails closed — no ALLOWED_ORIGIN, no key, or neither a spend cap nor
        an access code, and it refuses to spend; a POST must carry a
        matching Origin (documented as a filter, not authentication — a
        script can send any Origin it likes);
      · a daily dollar cap and a per-address rate limit (IPv6: per /64) in a
        SQLite Durable Object — on the free plan and strongly consistent.
        Each call reserves its worst case before going upstream and settles
        to real `usage` after, so simultaneous calls can't jointly overshoot:
        five at once against a cap that fits two sent exactly two upstream;
      · an optional ACCESS_CODE, compared as SHA-256 digests with
        timingSafeEqual;
      · a narrow relay: the Worker builds the OpenAI request itself, sizes
        are capped, the reply is trimmed to the function call and its cost,
        and OpenAI's failures come back in plain words ("OpenAI rejected
        this Worker's OPENAI_API_KEY", "used its whole 8000-token budget
        before writing a patch");
      · GET /health describes the deployment without spending; ?deep=1 also
        checks the key and model via GET /v1/models/{id}, which OpenAI
        doesn't bill.
      It sends no `reasoning.effort` unless configured: accepted values
      differ per model (gpt-6-luna has no `minimal`, gpt-6-astra rejects
      `none`) and a wrong one is a 400 on every call — the same lesson as
      max_tokens/temperature above. Prices were read off OpenAI's pricing
      page's raw HTML, not a summary of it; the list has moved on (gpt-6
      Luna/Sol, gpt-5.6), so gpt-6-luna and gpt-6-sol joined the allowlist.
      The page gained a free **test** for every provider — GET
      /v1/models/{id} for Anthropic and OpenAI, which proves the key and the
      model without generating anything; /health?deep=1 for the Worker,
      whose own model list then fills the dropdown so page and Worker can't
      drift — and a status pill that only ever shows what the last test
      found. Keys, URL and access code now save on `input`, not `change`,
      which only fires on blur. A URL pointing at an older copy of the Worker
      (no /health) is reported as outdated rather than unreachable, and
      patches still route through it. Checking the Anthropic path against
      Anthropic's current API reference turned up three latent bugs, each
      then reproduced on the old page: Haiku 4.5 was sent adaptive thinking,
      which it predates; Sonnet 5 was priced at $3/$15 instead of $2/$10;
      and readError called res.text() after a failed res.json() had already
      consumed the body, so a non-JSON error read "body stream already read".
      A fourth: typing a key that isn't sk-… threw a TypeError, because the
      wrong-provider check assumed every provider has a key pattern and the
      Worker doesn't. Opus 5 now opts into server-side refusal fallbacks,
      and a refusal is named as one rather than reported as "no patch".
      Deploying is now a button: .github/workflows/deploy-forge-worker.yml
      (manual trigger) runs the Worker's tests, deploys with the key
      uploaded in the same version — never live without it — then calls the
      live /health and writes the URL and a check table into the run
      summary. docs/tessera-forge-openai-integration.md rewritten as the
      deploy guide.
      Verified: 20 Worker tests in workerd (`cd workers && npm test`);
      `wrangler deploy --dry-run` accepts the config and bindings;
      tools/forge-check.mjs drives the real page against the real Worker —
      18/18, zero page errors; the workflow's steps were simulated with
      stubbed wrangler/curl. Then, deployed: GitHub Pages serves the new
      pages, and the workflow's first real run passed all 20 Worker tests on
      GitHub's runner and stopped at its missing-secrets gate, as designed
      (no Cloudflare credentials exist yet). That run's log also caught a
      mistake the simulation had baked in: GitHub runs a step with no stated
      shell as `bash -e`, WITHOUT pipefail — so a failed `wrangler deploy |
      tee` would have exited 0 and a failed deploy would have shown green.
      Fixed by stating `shell: bash`, which gets `-eo pipefail`; the failure
      path was then simulated under both shells (exit 0 before, 1 after).
      NOT verified: a real deploy to a Cloudflare account, or a real model
      reply — no credentials here. The first real run is the user's; the
      workflow summary, /health?deep=1 and the test button exist to make that
      run diagnose itself.
- [x] **Skeletal skinning measured against the real rigs — three bugs, all
      fixed.** Every earlier skinning entry ended the same way: the real
      Soldier/Fox/CesiumMan/Michelle files live on CDNs this sandbox couldn't
      reach, so fixes were checked on synthetic 2-bone rigs and handed over
      to be eyeballed on-device. This session could reach them — so rather
      than eyeball, built tools/skin-check.mjs. It poses a clip at an exact
      time through a new read-only `window.mosaic` handle and scores every
      tile against three.js's own skinning of the same mesh
      (SkinnedMesh.applyBoneTransform, per mesh, with that mesh's own
      skeleton), by correspondence: each tile against the posed copy of the
      triangle it sat on at bind pose. (A first version scored against
      whatever surface was nearest in the pose; it overstated Soldier's
      error, because an arm lowered against the torso finds the torso.) It
      found:
      · **Soldier's visor was driven by his hips.** The rig is two
        SkinnedMeshes with two skeletons — a 49-bone body and a 2-bone visor
        (neck, head) — and the page kept only the first skeleton, so the
        visor's bone indices 0/1 resolved to the body's hips and spine.
        Mid-Idle the visor sat ~8% of the model's height off the face.
      · **Tiles never rotated on Soldier or Michelle.** The orientation delta
        came from Quaternion.setFromRotationMatrix, which assumes an unscaled
        matrix. Mixamo rigs carry their Character node's 0.01 scale in every
        bone matrix, and fed 0.01·R that function returns a near-identity
        rotation for ANY pose — positions moved, facings stayed in T-pose:
        19% of Soldier's tiles faced away from the surface mid-Run (4% at
        rest). This would have kept Soldier looking rough even after the
        coordinate-space fix above, which repaired positions only.
      · **Every CesiumMan tile stood edge-on, even at rest.** Its armature
        node carries the Z-up→Y-up rotation, and the delta — rot(boneMatrix)
        — includes that rotation, so it was applied twice: median 90° off the
        surface, half the tiles facing inward. Michelle sat ~73° off at rest
        for the same reason.
      One formulation fixes all three. Per bone slot, W = (matrixWorld ·
      bindMatrixInverse) · boneMatrix · (bindMatrix · matrixWorld₀⁻¹) —
      three's own chain with the conversion out of the leaves' world bind
      space folded in per skin — over every skin's bones in one slot table
      (sample indices rebased into their skin's range). A tile's position is
      Σwᵢ·Wᵢ·p, its rotation the weighted blend of the Wᵢ rotations, taken
      with decompose() so scale can't corrupt it; the per-tile loop got
      cheaper, too (no per-tile correction matrix). While there: skin weights
      are read through the attribute accessors — glTF allows normalized
      u8/u16 weights, which `.array` hands over raw — and renormalised; and a
      tile takes its binding from the sample nearest the cell mean, where it
      actually sits, instead of an arbitrary one (Fox mid-Run, tiles >3% off
      their surface: 1.5% → 0.5%).
      Result — tiles facing away · median orientation drift since bind:
        Soldier, Run      19% · 11.4°  →  5.0% · 0.9°   (4.3% at rest)
        Soldier visor     ~8% of height off the face  →  0
        CesiumMan, walk   49.6% · 84°  →  0.3% · 0.7°
        Michelle, samba   21% · 58°    →  4.2% · 0°     (4.1% at rest)
        Fox               unchanged — it was right (no scale, no rotated armature)
      A correct skin holds a posed clip at its bind-pose numbers; all four
      now do. Screenshots (plain mesh / before / after) show it most on
      CesiumMan, whose head reads as a sphere again. Not fixed, noticed in
      those screenshots: Michelle has pale strips down her outer legs and
      arms in both old and new builds — probably the 4% of samples her
      colour bake misses ("96% covered"). A separate follow-up.
- [x] **The tessera's optical language — measured, then built.** The ask:
      perfect the tile as "the optical semantic language of space in 3
      dimensions lit by light seen by the eye". So first an eye:
      tools/optics-check.mjs renders the original model and its tesserae from
      one camera under one light and compares them with S-CIELAB (opponent
      colour, each channel blurred by the eye's contrast sensitivity at a
      viewing distance in pixels per degree, CIELAB ΔE), a signed lightness /
      saturation bias, and an SSIM of eye-filtered lightness ("form"); builds
      are seeded so runs repeat exactly. Its first reading overturned the
      starting guess (that grout darkens the image): tiles read 13–17 L*
      too BRIGHT, identically in every paint mode — the Empress is gilded
      and the tiles painted her as yellow plaster. Then, each kept only on
      the numbers (docs/optical-language.md has them all):
      · light — per-tile metalness/roughness baked beside colour; an
        environment to reflect (LIGHT: room / studio) through AgX (measured
        best of none / ACES / AgX; Khronos Neutral tried and refuted);
      · pre-filter — linear-light patch means (sRGB means darkened every
        mixed patch), Toksvig roughness from the patch's normal spread, the
        face resting on the patch's high point with its body sunk;
      · joint — a painted setting bed under the tiles (the gaps showed the
        black behind the figure), faces covering exactly inset² of the
        patch's projected area (coverage had swung with grid orientation),
        face colour paying back the joint's share, mortar-coloured sides;
      · truth — the colour bake now depth-tests its views, and reads skinned
        rigs at the pose it photographed them in. That was Michelle's pale
        strips (the follow-up above): not the 4% missed samples, but every
        lookup landing on another part of her body — 0% of her samples
        passed the depth test; now 93%, coverage 100%;
      · andamento — a direction field along colour contours plus L∞
        relaxation (Hausner 2001, on a surface; LAYING: courses / grid):
        course drift 11–16° → 8–12°, ~1–1.5 ΔE better on the Portrait and
        Michelle at 60–120 ppd, ~0.5 worse on the Empress's gold ornament;
      · paint — divisionist accents equiluminant with the face; glyph masks
        in a texture array (both principled, neither measurably moved ΔE).
      Result, ΔE before → after (room light, flat, thin) at 240 / 1920 ppd:
      Empress 16.1 → 2.9 / 11.3 → 0.9 (fuses below a just-noticeable
      difference); Empress bust 29.6 → 6.6 / 17.7 → 3.1; Portrait
      14.3 → 6.9 / 4.4 → 2.5; Michelle mid-samba 24.2 → 7.7 / 9.2 → 4.2.
      Form at 240 ppd: 0.68–0.85 → 0.95–0.99. The rules also exist as tested
      pure functions (src/core/optics.ts, tools/test/optics.test.mjs) and the
      tile's data shape as `TesseraOptics` in src/core/Tessera.ts. Open:
      metal still reads +2–4 L* bright at fusion (a compressive tone curve
      brightens a pre-filtered highlight), andamento's cost on dense
      ornament, and pure paint fusing ~0.3–0.5 ΔE worse than flat.
- [x] **VibeMesh — a live, generated avatar laid as tesserae.**
      `examples/tessera-vibemesh.html` is VibeMesh, the semantic-compression
      presence prototype: a parametric head generated and rigged in the page
      (six bones, eight blendshapes), puppeted by AvatarState packets from a
      webcam (MediaPipe), typed text (visemes), gestures or a paired tab. It
      is ported from three r134 to r160 (light units ×π; point lights matched
      at the head's distance; colour management, off at first as r134 had
      none, since turned on — see the next entry), and
      its AVATAR3D tier is re-cut as tesserae, with Mesh / Tesserae, three
      densities, flat / pure paint and grout / flush in the dock. The tile
      rules moved out of the mosaic page into a module,
      `examples/lib/tessera-kit.js` (sample → lay → build → drive; three.js
      passed in, so `tools/test/tessera-kit.test.mjs` tests it in Node). What
      a live avatar needed beyond the mosaic page:
      · tiles that move as the surface moves — each carries its patch's skin
        binding and the area-weighted mean of its blendshape deltas, and a
        TileDriver poses every tile each frame from the same bone matrices
        and morph weights that pose the mesh (identical to three's own CPU
        skinning; smile, jaw, blink, brows, head turns, Nod / Shake / Laugh
        and text visemes checked headless);
      · small tiles where a face is read — the generator's own lip, brow and
        socket masks become sampling importance (samples spent where tiles
        are small, weights kept area-true) and a target tile size; the lips
        had been a comb of slivers;
      · only surface that can be seen — the bust's neck runs up inside the
        head, and tiles laid on it poked out through the chin: the tiled jaw
        ended 1.7 cm short of the mesh's. `visibleVertices` renders every
        part's depth from 26 directions (eyes and teeth count as occluders)
        and tiles only surface a view facing it finds frontmost. The jaw's
        outline now matches; the eye model's mean barely moved (4.00 → 4.03
        ΔE at 240 ppd) — the jaw is a small share of the error;
      · rebuilds off the main thread — a laying takes the better part of a
        second, so the kit lays in a module worker (`tessera-worker.js`,
        with a same-thread fallback) and the avatar keeps moving until the
        new mosaic swaps in. Andamento's hash grid was keyed to the median
        tile, so a fine laying (a few thousand large tiles among twelve
        thousand small) made each large tile span hundreds of cells:
        11.8 s → 2.1 s with one hash per octree depth and per-seed candidate
        lists. The laying itself is unchanged: against the old code, 99.9–100%
        of tiles land in the same place with the same colour.
      One VibeMesh bug fixed on the way: adaptQuality's `quality>0.55` stayed
      true at 0.62, so a slow device rebuilt the avatar every ~1.5 s.
      Eye model, default framing, ΔE at 60 / 240 / 960 ppd (form 0.98–0.99
      at 240, 0.999 at 960): medium, flat 7.9 / 4.0 / 2.6; pure 7.8 / 4.0 /
      2.5 (on par with flat here, unlike the mosaic page); flush grout
      7.0 / 4.2 / 3.2; fine 7.5 / 4.1 / 3.1; coarse 10.0 / 4.4 / 2.1. Open:
      the finer the cut, the darker the fused head (−1.2 / −1.9 / −2.8 L*
      coarse / medium / fine), so something in the joint scales with tile
      count that the payback doesn't; and up close the downward-facing
      planes (under the nose and chin), which the mesh shades with the
      hemisphere's dark ground light, read lighter as tiles though the tiles
      face the same way — likely their upper sides catching the sky.

- [x] **VibeMesh — the camera, and the user's own face.**
      On an iPad the page neither tracked, mirrored nor calibrated to the
      user; now it does all three, and the avatar is built from the user:
      · tracking — MediaPipe Tasks FaceLandmarker (478 landmarks, 52
        blendshapes, the head's transform) replaces the legacy face_mesh and
        camera_utils scripts: GPU delegate with a CPU fallback (some iPads
        refuse the GPU; `?cpu` forces it), one camera stream, a
        requestVideoFrameCallback loop, the tracker loading while the camera
        permission is asked. Pose comes from the transform, expression from
        blendshapes (each with a gain, less the resting scores taken at the
        front view), mirrored as the page's own landmark path is;
      · calibration — the front view is the reference every other pose is
        judged against, and it had been taken mid-turn: it now waits for a
        still face (head speed measured per second, so a slow tracker's long
        frame gaps no longer hide a turn; pitch held loosely, ±28°, released
        after 10 s, as a frontal face reads 4–14° by camera placement). A pose
        completes on 12 frames or on five over a second (a 3–7 fps tracker
        couldn't hold 12 through a turn). Chin up/down were swapped, and the
        model's scale came from the eyes' outer corners, so every face came in
        ~30% small;
      · shape — a dense conform: each inner landmark goes where the tracker
        itself finds it on the model (a table measured by rendering the head
        and tracking the render), warped to the user's by an RBF; the face
        outline, whose depth the tracker only guesses, instead fits head width
        and jaw width and taper to the front photo's silhouette (portrait
        7.8 → 3.5 mm rms; a very square jaw still reaches the fit's range);
      · colour — the front photo is projected onto the face as a texture (its
        pixels ~4× finer than the vertices: lips, brows, lashes, freckles),
        over per-vertex colour baked from all five views. Loose hair in front
        of the face (large dark blobs off the eyes, brows, lips and nostrils)
        is filled from the skin around it; moles stay. Lids that land in the
        photo's eye opening take the lash line; the whites and irises come
        from the photo; a bald head is found against the backdrop and left
        bare (a Bald style);
      · light — the photo is divided by the avatar's OWN shading (the bare head
        rendered white under the rig, through the photo's camera) instead of a
        fitted a + b·n: fitted on the avatar's normals, which aren't the real
        face's, that over-corrected so much that even the photo's own light
        couldn't undo it. Relit, the avatar gives the photo back at the pose it
        was taken in, and the rig's light moves across it as the head turns.
        A closed loop then matches the avatar, rendered through the front
        photo's camera, to the photo over the face: one exposure, as a camera
        has, and a per-channel balance (dimming the albedo instead left the
        room's specular sheen on a darkened face). That loop had been
        calibrating a different image — three writes plain render targets
        linear and un-tone-mapped — so read-backs now take the screen's own
        pipeline. The room rig's curve is Khronos PBR Neutral, not AgX (colours
        stay where the camera put them; AgX greyed skin), and skin specular is
        0.3 (the photo already holds the person's highlights; a full sheen of
        the room greyed makeup, brows and dark skin). The kit carries a
        per-part specular so the tiles shine as the mesh does.
      Measured by `tools/likeness-check.mjs` — the eye model on the avatar
      against the front photo, through that photo's camera, over the face — on
      two synthetic sitters filmed by a headless fake camera (a Chromium
      Y4M webcam, a scripted head following the prompts): ΔE at 30 / 240 ppd,
      portrait 25.1 / 13.8 (form 0.56 / 0.88), Lee Perry-Smith 17.3 / 9.6
      (0.70 / 0.91), the face's mean colour within 1–2 sRGB levels. The
      projected texture moves it most (without it 27.0 / 15.6 and
      20.0 / 11.0); the shading probe 0.1–0.5; the outline fit is within
      noise here (the face mask barely reaches the jaw's edge). What remains
      is mostly the portrait's loose hair, which the avatar doesn't have.
      Tiles against their mesh (optics check, medium, flat, grout) went
      10.7 / 4.0 → 11.9 / 4.9: Neutral shows what AgX compressed. Open: the
      iPad path is verified only headless (CPU tracker, fake camera); bangs are
      filled as skin, not grown as hair; the photo's own shading beyond the
      rig's stays in the albedo; a photo with closed eyes paints closed lids.

- [x] **VibeMesh — a calibration that holds its shape, and the user's hair.**
      Tried on an iPad, the likeness read "a little wonky", the hair was a
      generic cap, and every eye, nostril and lip had the same folds. Seen
      bare (no texture, turned, smiling), the geometry was crumpled: the
      landmark warp was a Gaussian RBF fitted exactly to ~400 targets, and
      wherever neighbouring landmarks disagreed by a millimetre it rang into
      dents and ridges. Now:
      · the warp is a smoothing biharmonic spline (φ = −r, plus a constant):
        the least-bending field near the landmarks, features (eyes, brows,
        lips, nose) held tight, the rest loosely, depth loosest — 0.4 mm
        across the face, 1.2–1.3 mm in depth; each pose's landmarks are the
        median of its frames, aligned to the photographed one (a blink or a
        jittery frame no longer shapes the face);
      · the outline fit gained face length, with the chin's height as a
        target: Lee Perry-Smith's silhouette 9.5 → 3.0 mm rms, the portrait's
        7.9 → 2.3 mm (the jaw alone had stalled at 6.3);
      · the eyes' and mouth's rims are set on the user's own tracked contours
        (lid margins, the line where the lips meet), matched in each
        outline's normalised frame, the skin within 6 mm following; each
        eyeball is centred behind its real opening, and the teeth and mouth
        cavity move with the lip line (placed by the warp at their own depth,
        the lower teeth had come through the chin);
      · hair: MediaPipe's hair segmenter (0.8 MB, loaded with the tracker) on
        every calibration photo; the front photo's mask, read through its
        fitted camera, gives the hairline (walked up from the brows over a
        closed mask, median then gaussian), the silhouette each side, how far
        the hair hangs each side, its colour, and baldness. From these a
        shell grows over the scalp — as thick as the silhouette stands off
        the head, its edge tapering under the skin across the hairline (so
        no grid steps), the skin's colour beneath at the taper — with a
        curtain to each side's length, each vertex coloured from the photos
        that saw hair there. A "Yours" style is chosen automatically (or
        Bald); the old heuristics remain the fallback;
      · colour: the other photos are matched to the front one before they
        blend (per-view gains up to 1.4×), the chin-up/down photos weigh
        little in colour, hair and dark blobs are cleaned from the face only
        above the eyes / the upper lip (stubble and the chin's shadow are
        likeness), the shading correction is held within ±30%, and hair,
        iris and sclera reflect the room at low specular (dark hair had read
        silver, irises milky).
      Measured as before (the eye model on the avatar against the front
      photo, over the face): Lee Perry-Smith 17.3 / 9.6 → 14.6 / 8.1 ΔE at
      30 / 240 ppd (form 0.70 / 0.91 → 0.76 / 0.94); the portrait
      25.1 / 13.8 → 22.6–23.1 / 11.1–12.6 (0.56 / 0.88 → 0.59–0.60 /
      0.89–0.91; the range is run to run — the hair's segmentation varies
      frame to frame). Tiles against their mesh unchanged (11.9 / 4.9).
      Open: lip volume and the lid's crease still come from the generator;
      loose strands and updos are approximated by a shell; the iPad path is
      still verified only headless.

- [x] **VibeMesh — depth from the turns, and the photos from the side.**
      Seen in profile beside the stand-in heads, both avatars were flat: no
      nose to speak of, no brow, no chin. Every depth had come from the
      tracker's z, a guess from one picture. Measured against ground truth
      (each landmark ray-cast onto the true mesh of the stand-in head, the
      face outline excluded, the worst 10% trimmed): 3.9 mm rms, 5.2 mm in
      depth, the nose 7.2 mm off. The calibration's turns are real parallax,
      so:
      · the five views are now a perspective bundle — one focal length (a
        coarse search, pulled mildly toward 1·W), each view's pose, each
        landmark's position — solved by alternating linear triangulation
        with Gauss-Newton on the poses, outliers softened (a landmark the
        tracker hallucinated on the far side); 1.1 px reprojection, 1.1 s.
        Truth error 3.9 → 2.8 mm rms, depth 5.2 → 3.7, the nose 7.2 → 3.7;
        the portrait's truth is contaminated by strands (a "nose" 30 mm off)
        so Lee Perry-Smith is the clean witness. The conform trusts the
        metric depth (weight 1, λz ÷3); the outline fit reads the
        triangulated cloud (the eye-plane scale of the old path had drawn
        the ears' silhouette ~10% narrow — the head grew 13%), skipping
        outline landmarks the segmenter sees confident hair on above the
        mouth (hair hanging beside a face is not its outline; a beard is);
      · every projection is that view's own perspective camera — the texture
        bake, the shading probe, the hair fit's back-projection, and the
        likeness render. An affine camera fitted to a metric cloud had put
        the far outline wide and the nose narrow (the front view had read
        17.1 against the photo's 14.9 for a moment; with the true camera,
        12.6);
      · the skin shader blends three photos (front, left, right) by how
        squarely and surely each saw the surface, each with its de-lighting
        gain and the calibration's colour gain; the cheeks' sides had faded
        to blurred vertex colour with a smear where the front photo saw them
        steeply. Side views gained 2.5–3 ΔE at once;
      · the camera is asked for 1280×720 (the photo is the face's texture,
        and it is visibly sharper: freckles, lashes, brow hairs); on the CPU
        delegate the tracker reads a 640-wide copy, since 720p frames cost it
        3× there. Verified with a 720p stand-in clip;
      · the room rig gained a neutral hemisphere fill (key 0.9, fill 0.9);
        the eye and mouth rims correspond by normalised angle rather than a
        ray (a closed eye's slit had failed the ray and left the generator's
        open eye).
      Likeness, ΔE at 30 ppd, start of this entry → now, in the front / left
      / right / chin-up / chin-down calibration views — the side views are
      new to the measurement (tools/likeness-check on `likenessData(id)`):
      Lee Perry-Smith 14.9 / 18.2 / 18.1 / 20.3 / 20.6 → 13.1 / 15.3 / 14.2 /
      18.1 / 19.0 (form at 240 ppd, front, 0.937 → 0.955); the portrait
      23.7 / 27.4 / 26.6 / 31.3 / 28.8 → 21.9 / 24.5 / 21.3 / 28.5 / 27.2.
      Tiles against their mesh under the changed rig 11.7 / 4.5 (flat,
      grout). Not moved: the chin-up and chin-down views' lightness bias (−7
      / +10 L*) — a sweep of key against fill from 1.3/0 to 0.2/2.4 changed
      it by under 1 ΔE, so it sits in the photos' own baked light, not the
      rig. Open: the mouth region still bulges a little in profile; loose
      strands and updos remain a shell.

- [x] **VibeMesh — a voice you can see, a mouth that is yours, and paint.**
      · Voice: on an iPad the Voice button did nothing visible. The audio
        context was made after an `await` — outside the tap, which on iOS
        leaves it suspended, and the mic read as silence — and a second
        getUserMedia for audio can stop the camera's stream there. Now the
        context is made and resumed in the tap; with the camera running the
        mic is asked for together with the video in one stream, handed back
        to the picture-in-picture; speech-recognition errors show in the hint
        ("Speech: not-allowed · prosody only") instead of vanishing; the
        button fills with the mic's level; interim transcripts show as you
        speak. The mic's envelope only moves the jaw when the mouth isn't
        tracked (it had overridden a tracked mouth). Speech also lives in
        three more shapes the tracker gives — the O (mouthFunnel), the
        pressed m/p/b (mouthPress), the E (mouthStretch) — now morph targets
        on the wire (packet +3 bytes at the AVATAR3D tier).
      · Reading: a Read button. One line — «Oh, we see the moon. My pop
        bought a big fish — ah, mama.» — passes the mouth through its
        extremes; the tracker's own scores say when each peaks, and that
        frame's landmarks against the calibration's neutral are the user's
        own shape. The jaw bone's share is taken out (it opens the mouth at
        playback), and the smoothing spline (now shared with the conform as
        `fitSpline`) carries the moves to the mesh as this person's pucker,
        funnel, wide and press; the open "ah" sets how far the jaw drops
        (a gain on the bone). Speaking afterwards keeps refining: a frontal
        frame that beats a stored peak by 15% replaces it, rebuilt at most
        every 30 s. Verified headless only by feeding synthetic shapes
        (`mosaic.fakeRead`): the stand-in heads have no mouths that move.
      · Paint, from the mosaic page, in the kit: muted (the patch's own
        brightest and darkest quarter as the accents through the glyph, the
        base solved so the mix is the target — `decomposeMuted`) and rgb
        (per-channel noise-threshold dither of pure R, G, B — `makeNoise`),
        beside flat and pure; VibeMesh's dock has all four. Hair is not
        skin: the hair part carries a flow (down the head, in the surface),
        and the kit cuts flowing parts as slivers along it, finer and glass
        rather than matte; the face stays squares.
      Measured (tiles against their mesh, medium, grout, 30 / 240 ppd):
      flat 12.0 / 6.4, muted 11.7 / 6.4, pure 11.8 / 6.5 — the three fuse
      alike, as the optics say they should; rgb 21.2 / 13.7 at first, 11 L*
      dark: its dots are albedo 1 and clip in the room rig's tone curve where
      a flat tile of the same mean does not (the mode is exact in linear
      light), so the kit takes a coverage lift (1.55 here) to pay it back:
      19.3 / 9.2 with it, the lightness back to flat's (ΔL* −4.0 against
      −3.9). What remains is the dither's own colour grain (ΔC 15.5 of the
      19.3 at 30 ppd, 6.4 at 240), the look of the mode, not a fault in it.
      · The mouth, seen open for the first time. Rendering the jaw dropped
        showed the lips did not part: the mouth slit (1.3 mm) is thinner
        than a grid row, so testing quad centres against it cut a hole
        only when a row chanced onto the line — on the headless heads
        never — and the lower lip carried a tenth of the jaw's weight (a
        36 mm blend band), so an "ah" stretched the chin over a closed
        mouth. Now: one row is cut across the lip span (the one that
        straddles the line at the centre column, so no quad twists across
        the opening), first centred on the line at every column by a
        shear fading over six rows (the sculpt tilts rows a little across
        the span, and a rim projected from a tilted row crossed the next
        row and creased every fitted head's lower lip), its rims then
        projected straight onto the slit. The rims had never been set on a
        fitted head's own lip line before (no slit, no rims), and doing it
        showed the contour snap was built for the eyes: a mouth is a lens
        seventeen times wider than tall, its normalised angle is all y, so
        a vertex beside a corner followed the rim's centre and crossed the
        rim, and a closed mouth's contour put both rims on one line. The
        mouth's neighbourhood now follows the rim point nearest it, the
        two rims (the cut row's top and bottom edges, paired by column)
        are kept a slit apart, and each column is walked outward from the
        slit pushing any row that would cross a rim. Under that lay the
        real fault: the conform's anchors are where the tracker finds
        each landmark on a render of the default head, and around the
        mouth it reads that render loosely — the mouth line 8 mm above
        the sculpt's slit, the lower lip's edge 7 mm below it (the
        sculpt's is 17), the chin's bottom 15 mm above the sculpt's — so
        every fitted head had its lip line conformed 8 mm above its slit
        (the snap then dragged the slit up through the rows) and its chin
        stretched a third too long. The mouth and the chin's midline are
        now anchored on the sculpt's own features (corners, vermilion
        borders and bow, the inner contour on the slit, the midline down
        to the menton), and the tracker's perioral ring, which contradicts
        them, is left for the field to interpolate; within
        the lip span the skin weight splits at the slit (lower lip the
        jaw's, upper the head's), widening to a soft blend past the
        corners; the hinge moved from eye level to the ear canal's (a
        dropped jaw had swung the lip back more than down); and the two
        cavity shells were enlarged to close off the interior at any
        opening — the neck's top rises inside the head and had shown
        through as a skin-coloured floor. Teeth and a dark mouth at every
        opening, front and three-quarter.

## Backlog

- Raw WebGL2 renderer — **deferred**. Three.js instancing is already close to
  the metal; revisit only if benchmarking proves library overhead is the
  bottleneck (vs. instance count / fragment shading / glyph generation).
- Face plates, materials, glyph generation beyond reconstruction.
