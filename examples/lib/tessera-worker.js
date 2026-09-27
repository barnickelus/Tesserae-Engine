// Lays tesserae off the main thread for tessera-kit's createLayer():
// { id, req } → { id, result } (or { id, error }). The per-tile bindings
// travel as three packed buffers, transferred rather than copied.
import { laySurfaces } from './tessera-kit.js';

self.onmessage = ({ data: { id, req } }) => {
  try {
    const { buffers, ...result } = laySurfaces(req);
    self.postMessage({ id, result }, buffers);
  } catch (e) {
    self.postMessage({ id, error: String((e && e.stack) || e) });
  }
};
