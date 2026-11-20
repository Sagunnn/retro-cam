// Generates the app icons (PNG + SVG) with no dependencies.
//   node tools/make-icons.mjs
// Shapes are described once in 0..1 space and rendered to both SVG and
// supersampled PNG, so every size matches.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');

// Painter's-order shape list. Coordinates are fractions of the icon size.
// pad: shrinks the artwork toward the centre (used for the maskable icon).
function shapes(pad = 0) {
  const s = (v) => 0.5 + (v - 0.5) * (1 - pad * 2);
  const k = 1 - pad * 2;
  return [
    // shutter button, peeking out above the body
    { t: 'rrect', x: s(0.64), y: s(0.15), w: 0.17 * k, h: 0.12 * k, r: 0.045 * k, c: '#2b2925' },
    { t: 'rrect', x: s(0.655), y: s(0.165), w: 0.14 * k, h: 0.1 * k, r: 0.035 * k, c: '#55524b' },
    // camera body (yellow) with darker bottom edge
    { t: 'rrect', x: s(0.1), y: s(0.24), w: 0.8 * k, h: 0.58 * k, r: 0.11 * k, c: '#c99a00' },
    { t: 'rrect', x: s(0.1), y: s(0.22), w: 0.8 * k, h: 0.56 * k, r: 0.11 * k, c: '#ffd21f' },
    // highlight strip
    { t: 'rrect', x: s(0.16), y: s(0.255), w: 0.68 * k, h: 0.035 * k, r: 0.0175 * k, c: '#ffe680' },
    // viewfinder window
    { t: 'rrect', x: s(0.17), y: s(0.31), w: 0.15 * k, h: 0.1 * k, r: 0.025 * k, c: '#1d1b16' },
    { t: 'rrect', x: s(0.19), y: s(0.325), w: 0.05 * k, h: 0.03 * k, r: 0.012 * k, c: '#6a7a8a' },
    // lens: ring, barrel, glass, reflections
    { t: 'circle', cx: s(0.53), cy: s(0.52), r: 0.215 * k, c: '#2b2925' },
    { t: 'circle', cx: s(0.53), cy: s(0.52), r: 0.185 * k, c: '#c9ccd1' },
    { t: 'circle', cx: s(0.53), cy: s(0.52), r: 0.155 * k, c: '#1a1916' },
    { t: 'circle', cx: s(0.53), cy: s(0.52), r: 0.105 * k, c: '#1f3550' },
    { t: 'circle', cx: s(0.53), cy: s(0.52), r: 0.06 * k, c: '#0c1522' },
    { t: 'circle', cx: s(0.485), cy: s(0.475), r: 0.03 * k, c: '#ffffff' },
    { t: 'circle', cx: s(0.58), cy: s(0.57), r: 0.013 * k, c: '#8fb3d9' },
    // flash dot
    { t: 'circle', cx: s(0.8), cy: s(0.355), r: 0.035 * k, c: '#fff6cf' },
  ];
}

const BG = '#e2352a';

function inside(sh, x, y) {
  if (sh.t === 'circle') return (x - sh.cx) ** 2 + (y - sh.cy) ** 2 <= sh.r * sh.r;
  // rounded rect
  const rx = Math.max(sh.x + sh.r - x, 0, x - (sh.x + sh.w - sh.r));
  const ry = Math.max(sh.y + sh.r - y, 0, y - (sh.y + sh.h - sh.r));
  if (x < sh.x || x > sh.x + sh.w || y < sh.y || y > sh.y + sh.h) return false;
  return rx * rx + ry * ry <= sh.r * sh.r;
}

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

function render(size, pad, rounded) {
  const list = shapes(pad).map((s) => ({ ...s, rgb: hex(s.c) }));
  const bg = hex(BG);
  const SS = 4;
  const px = Buffer.alloc(size * size * 4);
  const cornerR = rounded ? 0.22 : 0;
  for (let py = 0; py < size; py++) {
    for (let pxi = 0; pxi < size; pxi++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (pxi + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;
          if (cornerR && !inside({ t: 'rrect', x: 0, y: 0, w: 1, h: 1, r: cornerR }, x, y)) continue;
          let col = bg;
          for (const s of list) if (inside(s, x, y)) col = s.rgb;
          r += col[0]; g += col[1]; b += col[2]; a += 255;
        }
      }
      const n = SS * SS;
      const o = (py * size + pxi) * 4;
      // un-premultiply so anti-aliased corners keep their colour
      const cov = a / 255;
      px[o] = cov ? r / cov : 0;
      px[o + 1] = cov ? g / cov : 0;
      px[o + 2] = cov ? b / cov : 0;
      px[o + 3] = a / n;
    }
  }
  return png(size, size, px);
}

// --- minimal PNG encoder ---------------------------------------------------
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function svg() {
  const f = (v) => +(v * 512).toFixed(2);
  const body = shapes(0)
    .map((s) =>
      s.t === 'circle'
        ? `<circle cx="${f(s.cx)}" cy="${f(s.cy)}" r="${f(s.r)}" fill="${s.c}"/>`
        : `<rect x="${f(s.x)}" y="${f(s.y)}" width="${f(s.w)}" height="${f(s.h)}" rx="${f(s.r)}" fill="${s.c}"/>`
    )
    .join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${f(0.22)}" fill="${BG}"/>
  ${body}
</svg>
`;
}

const jobs = [
  ['icon-192.png', 192, 0, false],
  ['icon-512.png', 512, 0, false],
  ['maskable-512.png', 512, 0.1, false],
  ['apple-touch-icon.png', 180, 0.04, false], // iOS rounds the corners itself
];
for (const [name, size, pad, rounded] of jobs) {
  writeFileSync(join(OUT, name), render(size, pad, rounded));
  console.log('wrote', name);
}
writeFileSync(join(OUT, 'icon.svg'), svg());
console.log('wrote icon.svg');
