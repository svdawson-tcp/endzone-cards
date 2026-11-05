// Pure-JS image helpers (no native code or WASM), so they run in the Supabase edge runtime.
import { decode as decodePng } from "npm:fast-png@6.2.0";
import jpeg from "npm:jpeg-js@0.4.4";

export type Rgba = { width: number; height: number; data: Uint8Array; hadAlpha: boolean };

/** Decode a PNG to 8-bit RGBA (handles grey, grey+alpha, RGB, RGBA, palette and 16-bit), alpha flattened onto white. */
export function pngToRgba(bytes: Uint8Array): Rgba {
  const p = decodePng(bytes) as unknown as {
    width: number; height: number; data: Uint8Array | Uint16Array; channels: number; depth: number;
    palette?: number[][];
  };
  const { width, height, channels, depth } = p;
  const n = width * height;
  const out = new Uint8Array(n * 4);
  const src = p.data;
  const v = (x: number) => (depth === 16 ? x >> 8 : x);
  let hadAlpha = false;
  for (let i = 0; i < n; i++) {
    let r: number, g: number, b: number, a = 255;
    if (p.palette) {
      const c = p.palette[src[i]] ?? [0, 0, 0, 255];
      r = c[0]; g = c[1]; b = c[2]; a = c.length > 3 ? c[3] : 255;
    } else if (channels === 1 || channels === 2) {
      r = g = b = v(src[i * channels]);
      if (channels === 2) a = v(src[i * 2 + 1]);
    } else {
      r = v(src[i * channels]); g = v(src[i * channels + 1]); b = v(src[i * channels + 2]);
      if (channels === 4) a = v(src[i * 4 + 3]);
    }
    if (a !== 255) {
      hadAlpha = true;
      const f = a / 255;
      r = Math.round(r * f + 255 * (1 - f)); g = Math.round(g * f + 255 * (1 - f)); b = Math.round(b * f + 255 * (1 - f));
    }
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = 255;
  }
  return { width, height, data: out, hadAlpha };
}

/** Shrink so the long edge is at most `edge` px (area-average, good for photos). Never enlarges. */
export function shrink(img: Rgba, edge: number): Rgba {
  const scale = edge / Math.max(img.width, img.height);
  if (scale >= 1) return img;
  const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
  const out = new Uint8Array(w * h * 4);
  const sx = img.width / w, sy = img.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0, g = 0, b = 0, c = 0;
      for (let yy = y0; yy < y1; yy++) {
        let k = (yy * img.width + x0) * 4;
        for (let xx = x0; xx < x1; xx++, k += 4) { r += img.data[k]; g += img.data[k + 1]; b += img.data[k + 2]; c++; }
      }
      const o = (y * w + x) * 4;
      out[o] = r / c; out[o + 1] = g / c; out[o + 2] = b / c; out[o + 3] = 255;
    }
  }
  return { width: w, height: h, data: out, hadAlpha: img.hadAlpha };
}

export function toJpeg(img: Rgba, quality: number): Uint8Array {
  const r = jpeg.encode({ data: img.data, width: img.width, height: img.height }, quality);
  return new Uint8Array(r.data);
}

export function jpegToRgba(bytes: Uint8Array): Rgba {
  const r = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 512 });
  return { width: r.width, height: r.height, data: r.data as Uint8Array, hadAlpha: false };
}

/** Decode whatever the bucket holds (PNG or JPEG). */
export function decodeAny(bytes: Uint8Array): Rgba {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return pngToRgba(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpegToRgba(bytes);
  throw new Error("not a PNG or JPEG");
}
