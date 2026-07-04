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
