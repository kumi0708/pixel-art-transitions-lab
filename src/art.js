// Pixel-art toolkit: a fixed 32-color palette, dithering helpers,
// shape rasterisers, a 3×5 bitmap font and the hero sprite.
// Everything is drawn with integer-aligned fillRect calls, so every pixel
// in the game buffer is exactly one of the palette colors.

export const W = 320;
export const H = 180;

export const PAL = {
  black: '#0b0a12', ink: '#1a1528', deep: '#2b2140', purple: '#4a2f5e',
  plum: '#7a3f6e', rose: '#c2577a', pink: '#f08ca0', peach: '#f8c8a0',
  cream: '#fff4d6', yellow: '#ffd75e', orange: '#f59a3a', rust: '#c45a2a',
  brown: '#7a3e24', dbrown: '#4a2618', sand: '#e8c17a', tan: '#b8875a',
  dgreen: '#1e3b2a', green: '#2f6b3a', lgreen: '#5ea84a', lime: '#a8d860',
  teal: '#1f5c63', cyan: '#3aa0a8', sky: '#7fd0e8', ice: '#c8f0f8',
  navy: '#16213e', blue: '#24477a', mblue: '#3a6fb0', grey1: '#3c3c50',
  grey2: '#6a6a80', grey3: '#a0a0b4', white: '#f4f4f8', red: '#d83a3a',
};
export const PALETTE = Object.values(PAL);
export const COVER = PAL.black;

export function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Standard 8×8 Bayer ordered-dither matrix (values 0..63).
export const BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37,
  63, 31, 55, 23, 61, 29, 53, 21,
];
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer4 = (x, y) => (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

export function makeCanvas(w = W, h = H) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
  return [c, g];
}

// Deterministic PRNG (mulberry32) so scenes look the same every load.
export function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function R(g, c, x, y, w = 1, h = 1) {
  if (w <= 0 || h <= 0) return;
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** Paint row y over [x0, x1) choosing a color (or null) per pixel; runs are merged. */
export function ditherRow(g, y, x0, x1, fn) {
  const END = '#end';
  let run, rx = x0;
  for (let x = x0; x <= x1; x++) {
    const c = x < x1 ? fn(x) : END;
    if (c !== run) {
      if (run && run !== END) R(g, run, rx, y, x - rx, 1);
      run = c; rx = x;
    }
  }
}

/** Vertical banded gradient with ordered dithering between neighbouring stops. */
export function gradient(g, stops, x0 = 0, x1 = W) {
  for (let s = 0; s < stops.length - 1; s++) {
    const a = stops[s], b = stops[s + 1];
    for (let y = a.y; y < b.y; y++) {
      const t = (y - a.y) / (b.y - a.y);
      ditherRow(g, y, x0, x1, (x) => (t > bayer4(x, y) ? b.c : a.c));
    }
  }
}

export function disc(g, c, cx, cy, r) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    const dy = y + 0.5 - cy;
    const k = r * r - dy * dy;
    if (k < 0) continue;
    const hw = Math.sqrt(k);
    const x0 = Math.round(cx - hw), x1 = Math.round(cx + hw);
    R(g, c, x0, y, x1 - x0, 1);
  }
}

export function ellipse(g, c, cx, cy, rx, ry) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    const dy = (y + 0.5 - cy) / ry;
    const k = 1 - dy * dy;
    if (k < 0) continue;
    const hw = rx * Math.sqrt(k);
    const x0 = Math.round(cx - hw), x1 = Math.round(cx + hw);
    R(g, c, x0, y, x1 - x0, 1);
  }
}

/** Dithered radial glow: density falls off linearly from the centre. */
export function glow(g, cx, cy, r, c, strength = 1, sy = 1) {
  const y0 = Math.max(0, Math.floor(cy - r * sy)), y1 = Math.min(H - 1, Math.ceil(cy + r * sy));
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W, Math.ceil(cx + r));
  for (let y = y0; y <= y1; y++) {
    const dy = (y + 0.5 - cy) / sy;
    ditherRow(g, y, x0, x1, (x) => {
      const d = Math.hypot(x + 0.5 - cx, dy) / r;
      return (1 - d) * strength > bayer4(x, y) ? c : null;
    });
  }
}

/** Filled triangle via scanlines. */
export function tri(g, c, ax, ay, bx, by, cx, cy) {
  const minY = Math.floor(Math.min(ay, by, cy)), maxY = Math.ceil(Math.max(ay, by, cy));
  const edges = [[ax, ay, bx, by], [bx, by, cx, cy], [cx, cy, ax, ay]];
  for (let y = minY; y < maxY; y++) {
    const yy = y + 0.5, xs = [];
    for (const [x1, y1, x2, y2] of edges) {
      if ((yy >= y1 && yy < y2) || (yy >= y2 && yy < y1)) xs.push(x1 + ((yy - y1) / (y2 - y1)) * (x2 - x1));
    }
    if (xs.length < 2) continue;
    const l = Math.round(Math.min(...xs)), r = Math.round(Math.max(...xs));
    R(g, c, l, y, r - l, 1);
  }
}

/** Bresenham-ish line of single pixels. */
export function line(g, c, x0, y0, x1, y1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) R(g, c, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n);
}

// ───────────────────────── 3×5 bitmap font ─────────────────────────
const GLYPHS = {
  'A': '.#.|#.#|###|#.#|#.#',
  'B': '##.|#.#|##.|#.#|##.',
  'C': '.##|#..|#..|#..|.##',
  'D': '##.|#.#|#.#|#.#|##.',
  'E': '###|#..|##.|#..|###',
  'F': '###|#..|##.|#..|#..',
  'G': '.##|#..|#.#|#.#|.##',
  'H': '#.#|#.#|###|#.#|#.#',
  'I': '###|.#.|.#.|.#.|###',
  'J': '..#|..#|..#|#.#|.#.',
  'K': '#.#|#.#|##.|#.#|#.#',
  'L': '#..|#..|#..|#..|###',
  'M': '#.#|###|###|#.#|#.#',
  'N': '##.|#.#|#.#|#.#|#.#',
  'O': '.#.|#.#|#.#|#.#|.#.',
  'P': '##.|#.#|##.|#..|#..',
  'Q': '.#.|#.#|#.#|##.|.##',
  'R': '##.|#.#|##.|#.#|#.#',
  'S': '.##|#..|.#.|..#|##.',
  'T': '###|.#.|.#.|.#.|.#.',
  'U': '#.#|#.#|#.#|#.#|###',
  'V': '#.#|#.#|#.#|#.#|.#.',
  'W': '#.#|#.#|#.#|###|#.#',
  'X': '#.#|#.#|.#.|#.#|#.#',
  'Y': '#.#|#.#|.#.|.#.|.#.',
  'Z': '###|..#|.#.|#..|###',
  '0': '###|#.#|#.#|#.#|###',
  '1': '.#.|##.|.#.|.#.|###',
  '2': '##.|..#|.#.|#..|###',
  '3': '##.|..#|.#.|..#|##.',
  '4': '#.#|#.#|###|..#|..#',
  '5': '###|#..|##.|..#|##.',
  '6': '.##|#..|###|#.#|###',
  '7': '###|..#|.#.|.#.|.#.',
  '8': '###|#.#|###|#.#|###',
  '9': '###|#.#|###|..#|##.',
  ' ': '...|...|...|...|...',
  '-': '...|...|###|...|...',
  '.': '...|...|...|...|.#.',
  ':': '...|.#.|...|.#.|...',
  '>': '#..|.#.|..#|.#.|#..',
  '<': '..#|.#.|#..|.#.|..#',
  '/': '..#|..#|.#.|#..|#..',
  '!': '.#.|.#.|.#.|...|.#.',
  '=': '...|###|...|###|...',
  '(': '.#.|#..|#..|#..|.#.',
  ')': '.#.|..#|..#|..#|.#.',
  '%': '#.#|..#|.#.|#..|#.#',
  ',': '...|...|...|.#.|#..',
  '+': '...|.#.|###|.#.|...',
  '*': '...|#.#|.#.|#.#|...',
  '_': '...|...|...|...|###',
  '#': '#.#|###|#.#|###|#.#',
  '?': '##.|..#|.#.|...|.#.',
  "'": '.#.|.#.|...|...|...',
  '|': '.#.|.#.|.#.|.#.|.#.',
};
const FONT = {};
for (const [k, v] of Object.entries(GLYPHS)) FONT[k] = v.split('|');

export function drawText(g, str, x, y, color, shadow) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const rows = FONT[ch];
    if (rows) {
      for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
        if (rows[r][c] === '#') {
          if (shadow) R(g, shadow, cx + c, y + r + 1);
          R(g, color, cx + c, y + r);
        }
      }
    }
    cx += 4;
  }
  return cx - x;
}
export const textWidth = (s) => s.length * 4 - 1;

// ───────────────────────── hero sprite (12×16) ─────────────────────────
const HERO_TOP = [
  '...kkkkkk...',
  '..kRRRRRRk..',
  '.kRRwRRRRRk.',
  '.kkkkkkkkkkk',
  '.khhssssssk.',
  '.khsskssksk.',
  '.khssssssk..',
  '..kspsssk...',
  '..kYYYYYYk..',
  '.kbbbYYbbbk.',
  '.ksbbbbbbsk.',
  '..kbbbbbbk..',
  '..kBBBBBBk..',
];
const HERO_LEGS = {
  idle: ['..kBBkkBBk..', '..kddk.kddk.', '..kkkk.kkkk.'],
  a: ['..kBBk.kBBk.', '.kddk...kddk', '.kkk.....kkk'],
  b: ['...kBBBBk...', '...kddddk...', '...kkkkkk...'],
};
const HERO_COL = {
  k: PAL.ink, R: PAL.red, w: PAL.pink, h: PAL.brown, s: PAL.peach, p: PAL.pink,
  Y: PAL.yellow, b: PAL.mblue, B: PAL.navy, d: PAL.dbrown,
};

/** Draw the hero with feet centred on (fx, fy). */
export function drawHero(g, fx, fy, pose, flip) {
  const rows = [...HERO_TOP, ...HERO_LEGS[pose]];
  const bob = pose === 'b' ? -1 : 0;
  const ox = Math.round(fx) - 6, oy = Math.round(fy) - 16 + bob;
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < 12; x++) {
      const ch = row[flip ? 11 - x : x];
      if (ch !== '.') R(g, HERO_COL[ch], ox + x, oy + y);
    }
  }
}
