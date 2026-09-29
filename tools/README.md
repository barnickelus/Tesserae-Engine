# Visual-critic harness

Render any prototype headlessly and screenshot it, so changes can be reviewed
without opening a device — the loop used to iterate on the tessera look.

## Setup

```
cd tools
npm install            # playwright + three (Chromium is preinstalled at /opt/pw-browsers)
```

## Use

```
node render.mjs <example-path> <out.png> [waitMs] [width] [height] [clicks]
```

Examples:

```
# default front view of the combined preview
node render.mjs examples/tessera-preview.html shot.png

# drive the controls before shooting (comma-separated button labels)
node render.mjs examples/tessera-preview.html shot.png 7000 1100 900 "50%,reframe"
node render.mjs examples/tessera-occupancy.html occ.png 6000 1100 900 "Helmet,packed"
```

## How it works

- Serves the repo over a local HTTP server (so same-origin model paths and the
  `examples/models/*.glb` files load, and textures stay canvas-readable).
- Launches Chromium with software WebGL (`--use-angle=swiftshader`), so it runs
  with no GPU. FPS in the screenshot is meaningless (software); only the image is.
- Intercepts the `unpkg.com` three.js imports and serves them from the local
  `three` package — fully offline, no proxy/CDN needed.
- Waits for `#count` to populate (the build finished), optionally clicks control
  buttons by label, stops `auto-spin` for a stable frame, then screenshots.

## Testing skeletal animation offline

`test-rig.glb` is a tiny (15KB) synthetic 2-bone rig (a "hip" + "elbow", with a
`Swing` clip that bends the elbow 0→90°→0°), generated entirely offline via
`make-test-rig.mjs` (constructs the mesh/skeleton/clip with three.js directly
and exports it with `GLTFExporter` — no network access needed). It exists
because the real rigged sample models (Fox, CesiumMan, Soldier) are all
external CDN URLs, and this sandbox has no general internet access — this
harness's own `**/*.glb` route substitutes a local static model for any of
them, so bone-driven animation can never actually be exercised against the
real assets here. `test-rig.glb` gives a known ground truth to test the
CPU-skinning code path (`buildSampler`'s bind-space sampling, `updateSkin()`'s
per-frame bone blending) end-to-end, fully offline.

To use it: temporarily add `TestRig: './models/test-rig.glb'` to `MODELS` in
whichever example you're debugging (having first copied `test-rig.glb` into
that example's `models/` folder), load it, and orbit to a side angle — the
default front-ish camera view can make a bend along the depth axis hard to
see. Remove the temporary MODELS entry before shipping.

Regenerate with `node make-test-rig.mjs test-rig.glb`.

`test-rig-offset.glb` (`make-test-rig-offset.mjs`) is the same rig, but with
the whole armature parented under a Group with a real position + rotation
offset instead of sitting at the world origin — i.e. how any actually-
authored character is set up, unlike `test-rig.glb`'s origin-centered
simplicity. This one caught a real bug `test-rig.glb` couldn't: sampling
skinned parts in bindMatrix space (identity for glTF, i.e. raw local vertex
space) instead of world space, which only coincidentally worked when the
mesh happened to sit at the origin — any off-origin character hit a total
coordinate-space mismatch against `center`/`radius`/the bake cameras (all
world-space), collapsing bake coverage to 0% and the shape into an
unrecognizable jumble. Load-bearing lesson: an origin-centered test rig
can hide exactly the class of bug that only shows up once a model has a
real placement, so prefer this one (or add the offset to `test-rig.glb`)
for future skinning-related debugging.

## Skinning check — measured against three.js, on the real rigs

```
node skin-check.mjs Soldier "TPose@0,Idle@0.6,Run@0.35" [shot-dir]
node skin-check.mjs Human "animation_0@0,animation_0@0.9"
```

Poses a clip at an exact time in `tessera-mosaic.html` (through its read-only
`window.mosaic` handle) and scores every tile against **three.js's own
skinning** of the same mesh (`SkinnedMesh.applyBoneTransform`, per mesh, with
that mesh's own skeleton). Each tile is compared with the posed copy of the
triangle it sat on at bind pose, so the numbers mean "does the tile follow its
own piece of skin": distance off that surface, angle to its normal, how many
tiles face away, and how far each tile's orientation drifted since bind. A
correct skin holds a posed clip at its bind-pose numbers.

Unlike `render.mjs`, this uses the **real** CDN rigs (Soldier, Fox, CesiumMan,
Michelle). They're fetched with `curl` into `tools/.glb-cache/` and served to
the page from there, because Chromium may not trust a TLS-intercepting proxy's
CA where curl does. So it needs network, once per model.

It's what found the three skinning bugs fixed in the roadmap's M8 log: a
second skeleton (Soldier's visor) resolved against the first mesh's bones,
tile rotations taken from scaled bone matrices (every Mixamo rig), and a
rotated armature node counted twice (CesiumMan).

## Optics check — the tessera, seen by a model of the eye

```
node optics-check.mjs Portrait "room,flat,thin|room,pure,thin" --zoom 2.2 --lift 0.3 --ppd 60,240,960,1920 --shots ../shots
node optics-check.mjs Michelle "room,flat,thin|room,flat,thin,grid" --pose SambaDance@1.3
PAGE=path/to/older.html node optics-check.mjs Empress "flat,thin"        # measure any version of the page
PAGE=examples/tessera-vibemesh.html node optics-check.mjs VibeMesh "Flat|Pure|Flat,Flush"   # the puppeted head
node --test test/*.test.mjs                                               # its S-CIELAB, the tile's optical rules, the kit
```

Renders `tessera-mosaic.html`'s original model and its tessera version from one
camera under one light, then compares them the way a viewer would: S-CIELAB
(Zhang & Wandell) — an opponent colour transform, each channel blurred by the
eye's contrast sensitivity at a viewing distance in pixels per degree, CIELAB
ΔE — plus the signed lightness and saturation bias and an SSIM of the
eye-filtered lightness ("form"). More ppd = further away; the ladder runs from
a visible mosaic (60) to full fusion (1920). A variant is a comma list of the
page's button labels (or `js:<code>` with `M` = `window.mosaic`, for
experiments); builds and `Math.random` are seeded, so runs repeat exactly.
`--shots` writes original | tessera | ΔE heat map composites.

Any page with the same `window.mosaic` handle can be measured: one without
`#model` (like `tessera-vibemesh.html`) says when it's ready (`mosaic.ready`,
`mosaic.settled()`), places the camera itself (`setView`), and marks what the
tiles don't replace — eyes, teeth — `userData.tesseraShared`, so it stays in
both renders. Variant labels there are the page's pills (case ignored).

## Likeness check — the avatar against the person it was built from

```
node likeness-check.mjs data.json 30,60,120,240 heat.png
```

`tessera-vibemesh.html` builds its avatar from a camera calibration; after one,
`window.mosaic.likenessData('center')` returns the front calibration photo, the
avatar rendered through that photo's own fitted camera (through the screen's
tone curve and exposure) over it, and the face mask — inside the tracked face
outline, less the eye and mouth openings. The check is the same eye model:
S-CIELAB ΔE at a ladder of viewing distances, the signed lightness bias ΔL*,
the chroma difference and the form SSIM, over the face; with a PNG path it
writes photo | avatar | ΔE and prints both sides' mean colour. `mosaic.like()`
switches the likeness stages (`{texture, probe, outline, conform, photo,
spec}`) for ablations, `mosaic.preloadTracker()` loads the tracker before the
camera opens (so a scripted fake camera starts in step with the prompts), and
`mosaic.av` reports the fit, the exposure and the colour loop's log.
`likenessData('left')` (or `right`, `up`, `down`) measures the same avatar in
the other calibration photos — through each photo's own camera, the
triangulated bundle's — so the sides and the profile count, not only the
front. `mosaic.calDump()` returns the calibration's landmarks per view and
the fitted cloud, for scoring a triangulation offline.
`mosaic.fakeRead({pucker:{sx,dy,dz,jaw,score}, …})` feeds the reading step
synthetic mouth shapes (the neutral landmarks with the lips moved) and
`mosaic.read` reports what a reading caught, so the mouth pipeline can be
checked without a face that talks. `mosaic.rebuildAvatar()` builds the avatar
again from the same identity (`mosaic.rebuild` is the tesserae's), so settings
— `mosaic.CONFORM.mouthAnchors`, `chinAnchors`, `perioralSkip`, `chinLift`,
or a `LIKE` switch (`lashes`, `hairTex`, `hairTexViews: 'center' | 'all'`,
beside the older ones) — can be compared within one calibration; `mosaic.H` is
the built head's grid (`pos`, `canon`, `rims`, `mrow`) and `mosaic.lmModel(lm)`
is where the conform's anchor for a tracker landmark sits on the sculpt.
`mosaic.snap({yaw, pitch, zoom, cx, cy, bs, jaw, grey})` renders the avatar alone
(turned, with expressions, or as bare grey geometry) for inspection, and
`mosaic.hairFitImage()` / `hairMaskImage(id)` draw the hair segmentation and
what was measured from it over the calibration photo. Headless,
Chromium's `--use-file-for-fake-video-capture=<file.y4m>` plays a clip as the
webcam; the numbers in [docs/roadmap.md](../docs/roadmap.md) come from rendered
heads turning left, right, up and down as the calibration asks.

Every rule in [docs/optical-language.md](../docs/optical-language.md) was kept
or dropped on these numbers. `lib/scielab.mjs` is the eye model;
`test/optics.test.mjs` tests the tile's rules in `src/core/optics.ts`, and
`test/tessera-kit.test.mjs` the same rules as `examples/lib/tessera-kit.js`
carries them (sampling, laying, the skin + blendshape driver, divisionist paint).

## Forge check — the page, end to end, against the real Worker

```
(cd ../workers && npm install) && node forge-check.mjs
```

Drives `tessera-forge.html` in Chromium through every provider. The Worker
provider talks to the actual `workers/tessera-forge-openai.js`, running in
workerd (Miniflare) on a local port with OpenAI scripted. Anthropic and
OpenAI direct calls are intercepted. It checks what the page sends (headers,
body per model), what it shows (connection state, costs, refusals, errors),
and what it stores (never a key in Worker mode).

The Worker's own unit tests are separate: `cd workers && npm test`.
