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

## Backlog

- Raw WebGL2 renderer — **deferred**. Three.js instancing is already close to
  the metal; revisit only if benchmarking proves library overhead is the
  bottleneck (vs. instance count / fragment shading / glyph generation).
- Face plates, materials, glyph generation beyond reconstruction.
