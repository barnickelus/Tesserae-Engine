// S-CIELAB (Zhang & Wandell): the eye's colour difference for patterned images.
// Shared by optics-check.mjs and its self-test. See optics-check.mjs for the
// model and its provenance.
import zlib from 'node:zlib';

// ── colour science ──────────────────────────────────────────────────────────
const LIN = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
const RGB2XYZ = [0.4124564, 0.3575761, 0.1804375, 0.2126729, 0.7151522, 0.0721750, 0.0193339, 0.1191920, 0.9503041];
const XYZ2OPP = [0.279, 0.720, -0.107, -0.449, 0.290, -0.077, 0.086, -0.590, 0.501];
const OPP2XYZ = inv3(XYZ2OPP);
const WHITE = mul3(RGB2XYZ, [1, 1, 1]);   // display white, D65
// [weight, spread in degrees] per channel — S-CIELAB
const FILTERS = [
  [[1.00327, 0.0500], [0.11442, 0.2250], [-0.11769, 7.0000]],   // luminance: band-pass
  [[0.61673, 0.0685], [0.38328, 0.8260]],                        // red–green
  [[0.56789, 0.0920], [0.43212, 0.6451]],                        // blue–yellow
];
function mul3(m, v) { return [m[0]*v[0]+m[1]*v[1]+m[2]*v[2], m[3]*v[0]+m[4]*v[1]+m[5]*v[2], m[6]*v[0]+m[7]*v[1]+m[8]*v[2]]; }
function inv3(m) {
  const [a, b, c, d, e, f, g, h, i] = m, A = e*i - f*h, B = -(d*i - f*g), C = d*h - e*g, det = a*A + b*B + c*C;
  return [A/det, -(b*i - c*h)/det, (b*f - c*e)/det, B/det, (a*i - c*g)/det, -(a*f - c*d)/det, C/det, -(a*h - b*g)/det, (a*e - b*d)/det];
}
const labF = t => t > 216/24389 ? Math.cbrt(t) : (24389/27 * t + 16) / 116;

// separable Gaussian exp(-x²/s²) (σ = s/√2), clamp-to-edge; very wide kernels
// run on a box-downsampled copy and come back bilinearly — they're smooth anyway
export function gaussian(src, w, h, sPx) {
  const sigma = sPx / Math.SQRT2;
  if (sigma < 0.3) return Float32Array.from(src);
  if (sigma > 24) {
    const k = Math.ceil(sigma / 8), dw = Math.ceil(w / k), dh = Math.ceil(h / k), small = new Float32Array(dw * dh);
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
      let acc = 0, n = 0;
      for (let yy = y*k; yy < Math.min(h, y*k + k); yy++) for (let xx = x*k; xx < Math.min(w, x*k + k); xx++) { acc += src[yy*w + xx]; n++; }
      small[y*dw + x] = acc / n;
    }
    const blurred = gaussian(small, dw, dh, sPx / k), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const fx = Math.min(dw - 1, Math.max(0, (x + 0.5) / k - 0.5)), fy = Math.min(dh - 1, Math.max(0, (y + 0.5) / k - 0.5));
      const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(dw - 1, x0 + 1), y1 = Math.min(dh - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
      out[y*w + x] = (blurred[y0*dw + x0]*(1-tx) + blurred[y0*dw + x1]*tx)*(1-ty) + (blurred[y1*dw + x0]*(1-tx) + blurred[y1*dw + x1]*tx)*ty;
    }
    return out;
  }
  const r = Math.ceil(3 * sigma), ker = new Float32Array(2*r + 1);
  let sum = 0; for (let i = -r; i <= r; i++) sum += (ker[i + r] = Math.exp(-(i*i) / (sPx*sPx)));
  for (let i = 0; i < ker.length; i++) ker[i] /= sum;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let acc = 0; for (let i = -r; i <= r; i++) acc += ker[i + r] * src[y*w + Math.min(w - 1, Math.max(0, x + i))];
    tmp[y*w + x] = acc;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let acc = 0; for (let i = -r; i <= r; i++) acc += ker[i + r] * tmp[Math.min(h - 1, Math.max(0, y + i))*w + x];
    out[y*w + x] = acc;
  }
  return out;
}

// sRGB bytes (bottom-up rows, from readPixels) → opponent channels, top-down
export function toOpponent(px, w, h) {
  const O = [new Float32Array(w*h), new Float32Array(w*h), new Float32Array(w*h)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = ((h - 1 - y)*w + x)*4, i = y*w + x;
    const xyz = mul3(RGB2XYZ, [LIN[px[s]], LIN[px[s + 1]], LIN[px[s + 2]]]), o = mul3(XYZ2OPP, xyz);
    O[0][i] = o[0]; O[1][i] = o[1]; O[2][i] = o[2];
  }
  return O;
}
export function eyeLab(O, w, h, ppd) {
  const F = O.map((ch, c) => {
    const out = new Float32Array(w*h);
    for (const [wt, sDeg] of FILTERS[c]) { const g = gaussian(ch, w, h, sDeg * ppd); for (let i = 0; i < out.length; i++) out[i] += wt * g[i]; }
    return out;
  });
  const L = new Float32Array(w*h), A = new Float32Array(w*h), B = new Float32Array(w*h);
  for (let i = 0; i < w*h; i++) {
    const xyz = mul3(OPP2XYZ, [F[0][i], F[1][i], F[2][i]]);
    const fx = labF(Math.max(0, xyz[0]) / WHITE[0]), fy = labF(Math.max(0, xyz[1]) / WHITE[1]), fz = labF(Math.max(0, xyz[2]) / WHITE[2]);
    L[i] = 116*fy - 16; A[i] = 500*(fx - fy); B[i] = 200*(fy - fz);
  }
  return { L, A, B };
}
// SSIM of two lightness maps inside the mask (Gaussian window, σ = 1.5 px)
export function ssim(L1, L2, w, h, mask) {
  const x = Float32Array.from(L1, v => v / 100), y = Float32Array.from(L2, v => v / 100);
  const mx = gaussian(x, w, h, 1.5*Math.SQRT2), my = gaussian(y, w, h, 1.5*Math.SQRT2);
  const xx = gaussian(x.map(v => v*v), w, h, 1.5*Math.SQRT2), yy = gaussian(y.map(v => v*v), w, h, 1.5*Math.SQRT2), xy = gaussian(x.map((v, i) => v*y[i]), w, h, 1.5*Math.SQRT2);
  const C1 = 0.01**2, C2 = 0.03**2; let acc = 0, n = 0;
  for (let i = 0; i < w*h; i++) if (mask[i]) {
    const vx = xx[i] - mx[i]*mx[i], vy = yy[i] - my[i]*my[i], cxy = xy[i] - mx[i]*my[i];
    acc += ((2*mx[i]*my[i] + C1)*(2*cxy + C2)) / ((mx[i]*mx[i] + my[i]*my[i] + C1)*(vx + vy + C2)); n++;
  }
  return acc / n;
}

// ── minimal PNG writer (for the composites) ────────────────────────────────
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(buf) { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
export function png(w, h, rgb) {   // rgb: Uint8Array, top-down, 3 bytes/px
  const raw = Buffer.alloc((w*3 + 1)*h);
  for (let y = 0; y < h; y++) { raw[y*(w*3 + 1)] = 0; Buffer.from(rgb.buffer, rgb.byteOffset + y*w*3, w*3).copy(raw, y*(w*3 + 1) + 1); }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

