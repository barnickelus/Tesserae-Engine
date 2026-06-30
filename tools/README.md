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
