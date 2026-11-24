// Four hand-built (procedural, seeded) rooms. Each room has:
//   bg  : static canvas drawn first (sky etc.)
//   mid : animated layer between bg and fg (clouds, stars, birds)
//   fg  : static canvas with transparency (terrain, buildings)
//   fx  : animated layer on top (lights, water, smoke, critters)

import {
  W, H, PAL, makeCanvas, rng, R, ditherRow, gradient, disc, ellipse, glow, tri, line, bayer4,
} from './art.js';

const sin = Math.sin, cos = Math.cos;
const hash = (a, b) => {
  let h = Math.imul(a, 374761393) + Math.imul(b, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// ─────────────────────────── shared bits ───────────────────────────
function cloud(g, x, y, s, light = PAL.white, shade = PAL.ice) {
  const parts = [[0, 0, 7], [8, -3, 9], [18, 0, 7], [-7, 2, 5], [26, 2, 5]];
  for (const [dx, dy, r] of parts) disc(g, shade, x + dx * s, y + dy * s + 2, r * s);
  for (const [dx, dy, r] of parts) disc(g, light, x + dx * s, y + dy * s, r * s);
  R(g, shade, x - 10 * s, y + 4 * s, 41 * s, 3);
}

function treeBlob(g, x, y, r, rnd) {
  disc(g, PAL.dgreen, x, y, r);
  disc(g, PAL.green, x - r * 0.25, y - r * 0.3, r * 0.72);
  for (let i = 0; i < r * 1.5; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * r * 0.6;
    R(g, PAL.lgreen, x - r * 0.3 + cos(a) * d, y - r * 0.4 + sin(a) * d * 0.7, 2, 1);
  }
}

// ─────────────────────────── 1. MEADOW ───────────────────────────
function meadow() {
  const rnd = rng(7);
  const [bg, b] = makeCanvas();
  gradient(b, [{ y: 0, c: PAL.mblue }, { y: 50, c: PAL.sky }, { y: 112, c: PAL.ice }]);
  glow(b, 252, 34, 40, PAL.ice, 0.85);
  glow(b, 252, 34, 20, PAL.cream, 0.9);
  disc(b, PAL.yellow, 252, 34, 11);
  disc(b, PAL.cream, 251, 33, 7);

  const [fg, f] = makeCanvas();
  // far mountains with snow caps and atmospheric haze
  const mh = [];
  for (let x = 0; x <= W; x++) mh[x] = 74 + 16 * sin(x * 0.021 + 1) + 9 * sin(x * 0.057 + 3) + 3 * sin(x * 0.17);
  for (let x = 0; x < W; x++) {
    const top = Math.round(mh[x]);
    const rightFace = mh[x + 1] > mh[x];
    R(f, rightFace ? PAL.blue : PAL.mblue, x, top, 1, 126 - top);
    if (top < 68) R(f, rightFace ? PAL.ice : PAL.white, x, top, 1, Math.round((68 - top) * 0.8) + 2);
  }
  for (let y = 92; y < 126; y++) {
    ditherRow(f, y, 0, W, (x) => (y > mh[x] && (y - 92) / 40 > bayer4(x, y) ? PAL.sky : null));
  }
  // rolling hills
  for (let x = 0; x < W; x++) {
    const top = Math.round(106 + 6 * sin(x * 0.03) + 3 * sin(x * 0.09 + 2));
    R(f, PAL.green, x, top, 1, 30);
    R(f, PAL.lgreen, x, top, 1, 2);
    if ((x * 7) % 5 === 0) R(f, PAL.lgreen, x, top + 3);
  }
  // tree line
  for (let i = 0; i < 46; i++) treeBlob(f, rnd() * W, 116 + rnd() * 6, 5 + rnd() * 6, rnd);
  // meadow
  gradient(f, [{ y: 124, c: PAL.lgreen }, { y: 150, c: PAL.lgreen }, { y: 180, c: PAL.green }]);
  for (let x = 0; x < W; x++) {
    const h = 1 + Math.floor(hash(x, 3) * 3);
    if (hash(x, 9) > 0.35) R(f, PAL.lgreen, x, 124 - h, 1, h);
  }
  // winding path
  const pathY = (x) => 154 + 7 * sin(x * 0.02 + 0.5);
  for (let x = 0; x < W; x++) {
    const y = Math.round(pathY(x));
    R(f, PAL.tan, x, y - 8, 1, 17);
    R(f, PAL.sand, x, y - 7, 1, 15);
    if (hash(x, 1) > 0.8) R(f, PAL.tan, x, y - 6 + Math.floor(hash(x, 2) * 12));
    if (hash(x, 4) > 0.93) R(f, PAL.cream, x, y - 5 + Math.floor(hash(x, 5) * 10));
  }
  // grass tufts & flowers
  for (let i = 0; i < 260; i++) {
    const x = Math.floor(rnd() * W), y = 128 + Math.floor(rnd() * 52);
    if (Math.abs(y - pathY(x)) < 10) continue;
    const kind = rnd();
    if (kind < 0.6) {
      R(f, PAL.green, x, y); R(f, PAL.green, x - 1, y - 1); R(f, PAL.green, x + 1, y - 1);
    } else {
      const col = [PAL.pink, PAL.yellow, PAL.white, PAL.rose, PAL.cream][Math.floor(rnd() * 5)];
      R(f, PAL.green, x, y, 1, 2);
      R(f, col, x - 1, y - 1, 3, 1); R(f, col, x, y - 2);
      R(f, PAL.yellow, x, y - 1);
    }
  }
  // cottage
  const hx = 30;
  R(f, PAL.dgreen, hx + 2, 140, 66, 3);                                 // contact shadow
  R(f, PAL.cream, hx + 4, 110, 60, 31);
  R(f, PAL.sand, hx + 50, 110, 14, 31);                                  // shaded side
  for (const px of [hx + 4, hx + 34, hx + 63]) R(f, PAL.brown, px, 110, 2, 31);
  R(f, PAL.brown, hx + 4, 110, 61, 2); R(f, PAL.brown, hx + 4, 124, 61, 2);
  line(f, PAL.brown, hx + 6, 112, hx + 33, 124); line(f, PAL.brown, hx + 36, 124, hx + 62, 112);
  // roof (tiled)
  R(f, PAL.grey2, hx + 46, 80, 8, 20); R(f, PAL.grey1, hx + 51, 80, 3, 20);
  R(f, PAL.grey3, hx + 45, 78, 10, 3);
  tri(f, PAL.dbrown, hx - 3, 112, hx + 34, 84, hx + 72, 112);
  tri(f, PAL.rust, hx, 110, hx + 34, 86, hx + 69, 110);
  for (let y = 90; y < 110; y += 3) {
    ditherRow(f, y, hx, hx + 70, (x) => {
      const inRoof = Math.abs(x - (hx + 34.5)) < (y - 86) * (35 / 24);
      if (!inRoof) return null;
      return (x + (y % 2) * 2) % 5 === 0 ? PAL.dbrown : PAL.brown;
    });
  }
  for (let y = 88; y < 110; y++) {
    ditherRow(f, y, hx, hx + 34, (x) => {
      const inRoof = Math.abs(x - (hx + 34.5)) < (y - 86) * (35 / 24) - 1;
      return inRoof && y % 3 !== 0 && bayer4(x, y) < 0.35 ? PAL.orange : null;
    });
  }
  // door + windows
  R(f, PAL.dbrown, hx + 22, 123, 14, 18); R(f, PAL.brown, hx + 23, 124, 12, 17);
  for (let x = hx + 25; x < hx + 35; x += 3) R(f, PAL.dbrown, x, 125, 1, 15);
  R(f, PAL.yellow, hx + 32, 132, 2, 2);
  R(f, PAL.grey3, hx + 20, 140, 18, 2);
  for (const wx of [hx + 8, hx + 42]) {
    R(f, PAL.brown, wx - 1, 113, 14, 11); R(f, PAL.sky, wx, 114, 12, 9);
    R(f, PAL.ice, wx + 1, 115, 3, 3); R(f, PAL.cream, wx + 5, 114, 2, 9); R(f, PAL.cream, wx, 118, 12, 1);
    R(f, PAL.brown, wx - 2, 123, 16, 3);
    for (let i = 0; i < 7; i++) R(f, i % 2 ? PAL.pink : PAL.rose, wx - 1 + i * 2, 122, 2, 1);
    R(f, PAL.green, wx - 1, 121, 14, 1);
  }
  // fence
  for (let x = 176; x < 268; x += 10) {
    R(f, PAL.brown, x, 128, 3, 13); R(f, PAL.tan, x, 128, 2, 12); R(f, PAL.cream, x, 128, 1, 1);
  }
  R(f, PAL.brown, 176, 131, 92, 2); R(f, PAL.tan, 176, 131, 92, 1);
  R(f, PAL.brown, 176, 137, 92, 2); R(f, PAL.tan, 176, 137, 92, 1);
  // big oak on the right
  R(f, PAL.dbrown, 285, 96, 12, 46); R(f, PAL.brown, 287, 96, 6, 46); R(f, PAL.tan, 288, 100, 1, 36);
  line(f, PAL.dbrown, 290, 110, 274, 96); line(f, PAL.dbrown, 292, 106, 310, 92);
  R(f, PAL.dbrown, 279, 140, 24, 3);
  const oak = rng(42);
  for (const [x, y, r] of [[290, 76, 24], [268, 88, 14], [312, 84, 16], [296, 58, 16], [276, 66, 13]]) treeBlob(f, x, y, r, oak);
  for (let i = 0; i < 8; i++) R(f, PAL.red, 270 + oak() * 40, 64 + oak() * 34, 2, 2); // apples

  const clouds = [[10, 22, 1, 0.06], [140, 40, 0.8, 0.09], [220, 16, 0.6, 0.05], [330, 52, 0.7, 0.11]];
  const flies = [[0, 0.013, 0.021], [2, 0.017, 0.011], [4, 0.011, 0.019]];

  return {
    name: 'MEADOW', ja: '昼の草原', shadow: PAL.green, bg, fg,
    mid(g, t) {
      for (const [x0, y, s, v] of clouds) {
        const x = Math.round(((x0 + t * v) % (W + 90)) - 45);
        cloud(g, x, y, s);
      }
      // distant birds
      for (let i = 0; i < 3; i++) {
        const x = Math.round(((t * 0.25 + i * 14) % (W + 40)) - 20), y = 60 + i * 4 + Math.round(sin(t * 0.03 + i) * 2);
        const up = ((t >> 3) + i) % 2;
        R(g, PAL.grey1, x - 2, y - up, 2, 1); R(g, PAL.grey1, x, y); R(g, PAL.grey1, x + 1, y - up, 2, 1);
      }
    },
    fx(g, t) {
      // chimney smoke
      for (let i = 0; i < 6; i++) {
        const ph = (t * 0.4 + i * 20) % 120;
        const x = hx + 50 + ph * 0.25 + sin(ph * 0.06 + i) * 3, y = 76 - ph * 0.45;
        const r = 1.5 + ph / 30;
        if (ph < 70) disc(g, ph < 25 ? PAL.grey3 : PAL.white, x, y, r);
        else glow(g, x, y, r * 1.6, PAL.white, 1.4 - ph / 120);
      }
      // butterflies
      for (const [k, fx, fy] of flies) {
        const x = 150 + sin(t * fx + k) * 70, y = 140 + sin(t * fy + k * 2) * 14;
        const flap = (t >> 2) % 2;
        const c = k === 2 ? PAL.yellow : PAL.pink;
        R(g, PAL.ink, x, y, 1, 2);
        if (flap) { R(g, c, x - 2, y - 1, 2, 2); R(g, c, x + 1, y - 1, 2, 2); }
        else { R(g, c, x - 1, y - 1, 1, 2); R(g, c, x + 1, y - 1, 1, 2); }
      }
    },
  };
}

// ─────────────────────────── 2. NIGHT TOWN ───────────────────────────
function town() {
  const rnd = rng(23);
  const [bg, b] = makeCanvas();
  gradient(b, [{ y: 0, c: PAL.ink }, { y: 48, c: PAL.navy }, { y: 100, c: PAL.deep }, { y: 128, c: PAL.purple }]);
  glow(b, 52, 34, 34, PAL.blue, 0.7);
  disc(b, PAL.cream, 52, 34, 11);
  disc(b, PAL.sand, 56, 34, 8);
  disc(b, PAL.cream, 50, 32, 8);
  for (const [x, y, r] of [[47, 30, 2], [54, 37, 1.5], [49, 39, 1.2]]) disc(b, PAL.sand, x, y, r);

  const stars = [];
  for (let i = 0; i < 110; i++) stars.push([Math.floor(rnd() * W), Math.floor(rnd() * 96), rnd() * 6.28, rnd()]);

  const [fg, f] = makeCanvas();
  // far skyline silhouettes
  for (let x = 0; x < W;) {
    const w = 10 + Math.floor(rnd() * 20), h = 88 + Math.floor(rnd() * 24);
    R(f, PAL.deep, x, h, w, 140 - h);
    if (rnd() < 0.35) tri(f, PAL.deep, x, h, x + w / 2, h - 8 - rnd() * 6, x + w, h);
    for (let wy = h + 4; wy < 130; wy += 6) for (let wx = x + 2; wx < x + w - 2; wx += 4) {
      if (rnd() < 0.18) R(f, PAL.plum, wx, wy, 1, 2);
    }
    x += w;
  }
  // church spire
  R(f, PAL.deep, 262, 60, 14, 60); tri(f, PAL.deep, 260, 62, 269, 34, 278, 62);
  R(f, PAL.deep, 268, 28, 1, 7); R(f, PAL.deep, 266, 30, 5, 1);
  disc(f, PAL.plum, 269, 72, 3); disc(f, PAL.orange, 269, 72, 2);

  // front houses
  const lit = [];
  const houses = [
    { x: 0, w: 46, h: 46, wall: PAL.purple, roof: PAL.rust },
    { x: 52, w: 50, h: 38, wall: PAL.brown, roof: PAL.deep },
    { x: 128, w: 44, h: 52, wall: PAL.teal, roof: PAL.dbrown },
    { x: 176, w: 40, h: 40, wall: PAL.plum, roof: PAL.grey1 },
    { x: 244, w: 54, h: 44, wall: PAL.purple, roof: PAL.rust },
    { x: 302, w: 30, h: 36, wall: PAL.brown, roof: PAL.deep },
  ];
  const base = 140;
  for (const hs of houses) {
    const top = base - hs.h;
    R(f, PAL.ink, hs.x - 1, top, hs.w + 2, hs.h);
    R(f, hs.wall, hs.x, top + 1, hs.w, hs.h - 1);
    // siding / brick texture
    for (let y = top + 3; y < base; y += 4) {
      ditherRow(f, y, hs.x, hs.x + hs.w, (x) => ((x + (y >> 2) * 3) % 7 === 0 ? PAL.ink : null));
    }
    R(f, PAL.ink, hs.x + hs.w - 4, top + 1, 4, hs.h - 1);
    // roof
    tri(f, PAL.ink, hs.x - 5, top + 1, hs.x + hs.w / 2, top - 20, hs.x + hs.w + 5, top + 1);
    tri(f, hs.roof, hs.x - 3, top, hs.x + hs.w / 2, top - 18, hs.x + hs.w + 3, top);
    for (let y = top - 14; y < top; y += 3) {
      const half = ((y - (top - 18)) / 18) * (hs.w / 2 + 3);
      R(f, PAL.ink, hs.x + hs.w / 2 - half + 1, y, half * 2 - 2, 1);
    }
    R(f, PAL.grey1, hs.x + hs.w * 0.7, top - 18, 6, 12); R(f, PAL.ink, hs.x + hs.w * 0.7 + 4, top - 18, 2, 12);
    // windows
    for (let wy = top + 6; wy < base - 18; wy += 14) {
      for (let wx = hs.x + 5; wx < hs.x + hs.w - 12; wx += 14) {
        R(f, PAL.ink, wx - 1, wy - 1, 10, 10);
        const on = rnd() < 0.7;
        R(f, on ? PAL.yellow : PAL.navy, wx, wy, 8, 8);
        if (on) { R(f, PAL.orange, wx, wy + 5, 8, 3); R(f, PAL.cream, wx + 1, wy + 1, 2, 2); lit.push([wx, wy]); }
        else R(f, PAL.blue, wx + 1, wy + 1, 2, 2);
        R(f, PAL.ink, wx + 3, wy, 2, 8); R(f, PAL.ink, wx, wy + 3, 8, 1);
        R(f, PAL.dbrown, wx - 2, wy + 8, 12, 2);
      }
    }
    // door
    const dx = hs.x + Math.floor(hs.w / 2) - 5;
    R(f, PAL.ink, dx - 1, base - 16, 12, 16); R(f, PAL.dbrown, dx, base - 15, 10, 15);
    R(f, PAL.brown, dx + 1, base - 14, 3, 13); R(f, PAL.yellow, dx + 7, base - 8);
    R(f, PAL.orange, dx + 2, base - 20, 6, 3);
  }
  // street (cobblestones)
  R(f, PAL.grey1, 0, 140, W, 40);
  R(f, PAL.grey3, 0, 140, W, 1); R(f, PAL.grey2, 0, 141, W, 2); R(f, PAL.ink, 0, 143, W, 1);
  for (let row = 0, y = 145; y < H; row++, y += 5) {
    for (let x = -(row % 2) * 4; x < W; x += 8) {
      R(f, PAL.grey2, x + 1, y, 6, 4);
      R(f, PAL.grey3, x + 1, y, 3, 1);
      R(f, PAL.deep, x + 1, y + 3, 6, 1);
    }
  }
  // puddles reflecting the lamps
  for (const [px, py, rx] of [[96, 166, 22], [228, 158, 18]]) {
    ellipse(f, PAL.navy, px, py, rx, 4);
    ellipse(f, PAL.blue, px - 3, py - 1, rx * 0.6, 2);
    R(f, PAL.yellow, px + 4, py - 1, 3, 1); R(f, PAL.orange, px + 3, py + 1, 5, 1);
  }
  // lamp posts
  const lamps = [[118, 98], [228, 98]];
  for (const [lx, ly] of lamps) {
    R(f, PAL.ink, lx - 1, ly + 8, 3, 34); R(f, PAL.ink, lx - 3, 139, 7, 3);
    R(f, PAL.ink, lx - 4, ly - 2, 9, 2); R(f, PAL.ink, lx - 3, ly - 4, 7, 2);
    R(f, PAL.ink, lx - 4, ly, 9, 9); R(f, PAL.yellow, lx - 3, ly + 1, 7, 7);
    R(f, PAL.cream, lx - 1, ly + 2, 3, 4); R(f, PAL.ink, lx - 4, ly + 8, 9, 1);
  }
  // cat on the roof of the teal house
  const catX = 160, catY = 140 - 52 - 9;
  R(f, PAL.ink, catX, catY, 7, 5); R(f, PAL.ink, catX + 5, catY - 3, 5, 4);
  R(f, PAL.ink, catX + 5, catY - 5); R(f, PAL.ink, catX + 9, catY - 5);

  const flies = [0, 1, 2, 3, 4, 5].map((i) => [rnd() * W, 120 + rnd() * 40, rnd() * 6]);

  return {
    name: 'NIGHT TOWN', ja: '夜の街', shadow: PAL.ink, bg, fg,
    mid(g, t) {
      for (const [x, y, ph, big] of stars) {
        const v = sin(t * 0.04 + ph * 3);
        if (v > 0.55) {
          R(g, PAL.white, x, y);
          if (big > 0.8) { R(g, PAL.grey3, x - 1, y); R(g, PAL.grey3, x + 1, y); R(g, PAL.grey3, x, y - 1); R(g, PAL.grey3, x, y + 1); }
        } else if (v > -0.2) R(g, PAL.grey3, x, y);
        else R(g, PAL.grey2, x, y);
      }
      // shooting star
      const s = t % 420;
      if (s < 26) {
        const x = 300 - s * 6, y = 8 + s * 2;
        for (let k = 0; k < 10; k++) R(g, k < 2 ? PAL.white : k < 5 ? PAL.ice : PAL.grey2, x + k * 2, y - k, 2, 1);
      }
    },
    fx(g, t) {
      for (let i = 0; i < lit.length; i++) {
        if (hash(t >> 4, i) < 0.06) { const [wx, wy] = lit[i]; R(g, PAL.orange, wx, wy, 3, 3); R(g, PAL.orange, wx + 5, wy, 3, 3); }
      }
      for (const [k, [lx, ly]] of lamps.entries()) {
        const fl = sin(t * 0.21 + k) * 1.5 + (hash(t >> 2, k) > 0.9 ? -3 : 0);
        glow(g, lx + 0.5, ly + 4, 30 + fl, PAL.orange, 0.42);
        glow(g, lx + 0.5, ly + 4, 14 + fl * 0.5, PAL.yellow, 0.6);
        glow(g, lx + 0.5, 152, 26, PAL.grey2, 0.5, 0.25);
      }
      // cat eyes + tail
      const blink = t % 200 < 8;
      if (!blink) { R(g, PAL.lime, catX + 6, catY - 2); R(g, PAL.lime, catX + 8, catY - 2); }
      const sw = Math.round(sin(t * 0.05) * 2);
      R(g, PAL.ink, catX - 1, catY + 2, 1, 3); R(g, PAL.ink, catX - 2 + sw, catY - 1, 1, 3); R(g, PAL.ink, catX - 2 + sw, catY - 2);
      for (const [x0, y0, ph] of flies) {
        const x = x0 + sin(t * 0.013 + ph) * 18, y = y0 + sin(t * 0.021 + ph * 2) * 8;
        if (sin(t * 0.08 + ph * 5) > 0.1) { R(g, PAL.lime, x, y); glow(g, x + 0.5, y + 0.5, 3, PAL.yellow, 0.6); }
      }
    },
  };
}

// ─────────────────────────── 3. CRYSTAL CAVE ───────────────────────────
function cave() {
  const rnd = rng(99);
  const [bg, b] = makeCanvas();
  R(b, PAL.ink, 0, 0, W, H);
  // stone wall
  for (let row = 0, y = 0; y < 132; row++) {
    const h = 9 + Math.floor(rnd() * 5);
    for (let x = -Math.floor(rnd() * 20); x < W;) {
      const w = 14 + Math.floor(rnd() * 14);
      const r0 = rnd();
      const body = r0 < 0.4 ? PAL.deep : r0 < 0.55 ? PAL.purple : PAL.grey1;
      const hi = body === PAL.grey1 ? PAL.grey2 : body === PAL.purple ? PAL.plum : PAL.grey1;
      R(b, PAL.ink, x, y, w, h);
      R(b, body, x + 1, y + 1, w - 2, h - 2);
      R(b, hi, x + 1, y + 1, w - 3, 1); R(b, hi, x + 1, y + 1, 1, h - 3);
      R(b, PAL.ink, x + 1, y + h - 2, w - 2, 1);
      if (rnd() < 0.25) { R(b, PAL.dgreen, x + 2, y + 1, 4 + rnd() * 6, 2); R(b, PAL.green, x + 3, y + 1, 2, 1); }
      if (rnd() < 0.2) R(b, PAL.deep, x + 4 + rnd() * (w - 8), y + 3, 1, h - 6); // crack
      x += w;
    }
    y += h;
  }
  // vignette toward edges
  for (let y = 0; y < 132; y++) {
    ditherRow(b, y, 0, W, (x) => {
      const d = Math.hypot((x - W / 2) / (W / 2), (y - 90) / 110);
      return (d - 0.42) * 1.7 > bayer4(x, y) ? PAL.ink : null;
    });
  }
  // stalactites
  for (let i = 0; i < 16; i++) {
    const x = rnd() * W, w = 4 + rnd() * 7, h = 10 + rnd() * 24;
    tri(b, PAL.ink, x - w, 0, x + w, 0, x, h + 1);
    tri(b, PAL.deep, x - w + 1, 0, x + w - 1, 0, x, h);
    tri(b, PAL.grey1, x - w + 1, 0, x - 1, 0, x, h - 2);
    R(b, PAL.grey2, x - 2, h - 6, 1, 3);
  }
  // floor
  R(b, PAL.deep, 0, 128, W, 52);
  for (let row = 0, y = 130; y < H; row++, y += 10) {
    for (let x = -(row % 2) * 12; x < W; x += 24) {
      R(b, PAL.grey1, x + 1, y, 22, 9); R(b, PAL.grey2, x + 1, y, 22, 1);
      if (hash(x, y) > 0.6) R(b, PAL.grey2, x + 6, y + 4, 4, 1);
    }
  }
  for (let y = 150; y < H; y++) ditherRow(b, y, 0, W, (x) => ((y - 150) / 44 > bayer4(x, y) ? PAL.ink : null));
  R(b, PAL.ink, 0, 128, W, 2);
  // pool
  ellipse(b, PAL.grey2, 236, 160, 54, 12);
  ellipse(b, PAL.navy, 236, 160, 51, 10);
  ellipse(b, PAL.blue, 236, 159, 40, 6);
  ellipse(b, PAL.teal, 236, 158, 24, 3);

  // crystals
  const crystalSets = [[34, 128, 1.1], [278, 130, 1.3], [200, 128, 0.7], [118, 128, 0.6]];
  function shard(x, base, h, w) {
    tri(b, PAL.teal, x - w - 1, base - h + w, x, base - h - 1, x + w + 1, base - h + w);
    R(b, PAL.teal, x - w - 1, base - h + w, 2 * w + 2, h - w);
    tri(b, PAL.sky, x - w, base - h + w, x, base - h, x, base - h + w);
    R(b, PAL.sky, x - w, base - h + w, w, h - w);
    tri(b, PAL.cyan, x, base - h, x + w, base - h + w, x, base - h + w);
    R(b, PAL.cyan, x, base - h + w, w, h - w);
    R(b, PAL.ice, x - w + 1, base - h + w, 1, h - w - 2);
    R(b, PAL.white, x - 1, base - h + 2);
  }
  for (const [cx, base, s] of crystalSets) {
    shard(cx - 8 * s, base, 14 * s, 3 * s);
    shard(cx + 9 * s, base, 16 * s, 3.5 * s);
    shard(cx, base, 26 * s, 4.5 * s);
  }
  // torches
  const torches = [[76, 76], [166, 70]];
  for (const [tx, ty] of torches) {
    R(b, PAL.ink, tx - 4, ty + 4, 9, 3); R(b, PAL.dbrown, tx - 2, ty + 2, 5, 14);
    R(b, PAL.brown, tx - 1, ty + 2, 2, 14); R(b, PAL.grey2, tx - 3, ty + 1, 7, 2);
  }

  const [fg] = makeCanvas(); // everything static lives on bg here
  const motes = Array.from({ length: 22 }, () => [rnd() * W, rnd() * 120, rnd() * 6]);

  return {
    name: 'CRYSTAL CAVE', ja: '水晶の洞窟', shadow: PAL.ink, bg, fg,
    fx(g, t) {
      for (const [k, [cx, base, s]] of crystalSets.entries()) {
        glow(g, cx, base - 12 * s, 40 * s, PAL.teal, 0.45 + 0.15 * sin(t * 0.03 + k));
        glow(g, cx, base - 10 * s, 18 * s, PAL.cyan, 0.35 + 0.1 * sin(t * 0.03 + k));
        if ((t >> 3) % 9 === k) R(g, PAL.white, cx + 1, base - 24 * s);
      }
      for (const [k, [tx, ty]] of torches.entries()) {
        const fl = sin(t * 0.3 + k * 2) * 2 + sin(t * 0.77 + k) * 1.5;
        glow(g, tx + 0.5, ty, 46 + fl, PAL.rust, 0.33);
        glow(g, tx + 0.5, ty, 24 + fl, PAL.orange, 0.45);
        const fh = 7 + Math.round(sin(t * 0.4 + k) * 1.5 + hash(t >> 2, k) * 2);
        disc(g, PAL.rust, tx + 0.5, ty, 3.5);
        tri(g, PAL.orange, tx - 3, ty, tx + 4, ty, tx + 0.5 + sin(t * 0.25) * 1.5, ty - fh);
        disc(g, PAL.orange, tx + 0.5, ty - 0.5, 2.6);
        tri(g, PAL.yellow, tx - 1.5, ty, tx + 2.5, ty, tx + 0.5 + sin(t * 0.3) , ty - fh + 3);
        R(g, PAL.cream, tx, ty - 2, 1, 2);
        for (let e = 0; e < 3; e++) {
          const ph = (t * 0.6 + e * 23 + k * 11) % 40;
          R(g, ph < 20 ? PAL.yellow : PAL.rust, tx + sin(ph * 0.3 + e) * 3, ty - 8 - ph * 0.7);
        }
      }
      // drip falling into the pool, then ripples
      const d = t % 150;
      if (d < 40) R(g, PAL.ice, 236, 30 + d * 3.2, 1, 2);
      else if (d < 100) {
        const r = (d - 40) * 0.6;
        for (let a = 0; a < 6.28; a += 0.25) {
          const x = 236 + cos(a) * r, y = 158 + sin(a) * r * 0.25;
          if ((x - 236) ** 2 / 2500 + (y - 160) ** 2 / 100 < 1) R(g, d < 70 ? PAL.ice : PAL.sky, x, y);
        }
      }
      for (let i = 0; i < 7; i++) {
        const x = 200 + ((i * 37 + t * 0.3) % 72), y = 156 + (i % 3) * 3;
        if (hash(i, t >> 3) > 0.4) R(g, PAL.sky, x, y, 3, 1);
      }
      for (const [x0, y0, ph] of motes) {
        const x = (x0 + t * 0.05) % W, y = y0 + sin(t * 0.01 + ph) * 6;
        if (sin(t * 0.03 + ph) > 0) R(g, PAL.grey3, x, y);
      }
    },
  };
}

// ─────────────────────────── 4. SUNSET SHORE ───────────────────────────
function shore() {
  const rnd = rng(5);
  const [bg, b] = makeCanvas();
  gradient(b, [
    { y: 0, c: PAL.deep }, { y: 22, c: PAL.purple }, { y: 46, c: PAL.plum },
    { y: 68, c: PAL.rose }, { y: 86, c: PAL.orange }, { y: 102, c: PAL.yellow },
  ]);
  glow(b, 200, 98, 60, PAL.yellow, 0.5);
  disc(b, PAL.yellow, 200, 98, 24);
  disc(b, PAL.cream, 200, 98, 17);
  for (const [y, h] of [[86, 1], [90, 1], [93, 2], [96, 2]]) R(b, PAL.orange, 170, y, 60, h);
  for (const [x, y, w] of [[20, 30, 90], [120, 44, 70], [230, 24, 80], [250, 58, 60], [40, 62, 50]]) {
    ellipse(b, PAL.plum, x + w / 2, y + 2, w / 2, 3);
    ellipse(b, PAL.pink, x + w / 2 - 4, y, w / 2 - 6, 2);
  }

  const [fg, f] = makeCanvas();
  // island + sailboat silhouettes
  for (let x = 14; x < 100; x++) {
    const h = Math.round(5 + 4 * sin((x - 14) * 0.07) + 2 * sin(x * 0.3));
    R(f, PAL.deep, x, 101 - h, 1, h);
  }
  tri(f, PAL.deep, 128, 98, 136, 82, 136, 98); tri(f, PAL.deep, 137, 98, 137, 84, 143, 98);
  R(f, PAL.deep, 126, 98, 20, 2);
  // sea
  gradient(f, [{ y: 101, c: PAL.rose }, { y: 104, c: PAL.plum }, { y: 116, c: PAL.purple }, { y: 140, c: PAL.navy }]);
  R(f, PAL.pink, 0, 101, W, 1);
  // sand
  gradient(f, [{ y: 138, c: PAL.tan }, { y: 146, c: PAL.sand }, { y: 160, c: PAL.sand }, { y: 180, c: PAL.tan }]);
  for (let i = 0; i < 220; i++) R(f, rnd() < 0.5 ? PAL.tan : PAL.peach, rnd() * W, 146 + rnd() * 34);
  // shells & starfish
  for (let i = 0; i < 10; i++) {
    const x = rnd() * W, y = 150 + rnd() * 26;
    if (rnd() < 0.5) { R(f, PAL.cream, x, y, 3, 2); R(f, PAL.pink, x + 1, y, 1, 2); }
    else { R(f, PAL.orange, x - 2, y, 5, 1); R(f, PAL.orange, x, y - 2, 1, 5); R(f, PAL.rust, x, y); }
  }
  // sandcastle (on a front layer so the waves pass behind it)
  const [front, fr] = makeCanvas();
  const sc = 246;
  R(fr, PAL.tan, sc, 154, 36, 18); R(fr, PAL.sand, sc + 1, 155, 26, 17);
  R(fr, PAL.tan, sc + 10, 142, 16, 14); R(fr, PAL.sand, sc + 11, 143, 10, 13);
  for (let x = sc; x < sc + 36; x += 6) R(fr, PAL.tan, x, 151, 3, 3);
  for (let x = sc + 10; x < sc + 26; x += 5) R(fr, PAL.tan, x, 139, 3, 3);
  R(fr, PAL.dbrown, sc + 15, 162, 6, 10); R(fr, PAL.dbrown, sc + 16, 147, 3, 4);
  R(fr, PAL.dbrown, sc + 17, 126, 1, 14); R(fr, PAL.red, sc + 18, 126, 7, 4); R(fr, PAL.rust, sc + 18, 129, 7, 1);
  // palm tree (curved trunk)
  for (let i = 0; i <= 30; i++) {
    const tt = i / 30;
    const x = 34 + tt * 22 + sin(tt * 3) * 6, y = 176 - tt * 104, w = 7 - tt * 2.5;
    R(f, PAL.dbrown, x - w / 2, y, w, 5);
    R(f, PAL.brown, x - w / 2 + 1, y, w - 2.5, 4);
    if (i % 2 === 0) R(f, PAL.tan, x - w / 2 + 1, y + 1, w - 3, 1);
  }
  ellipse(f, PAL.tan, 36, 177, 12, 2);
  const topX = 62, topY = 70;
  const fronds = [[-2.7, 34], [-2.2, 30], [-1.6, 26], [-0.9, 30], [-0.35, 34], [0.25, 30], [3.0, 24]];
  for (const [ang, len] of fronds) {
    for (let s = 0; s < len; s++) {
      const u = s / len;
      const x = topX + cos(ang) * s, y = topY + sin(ang) * s * 0.55 + u * u * 16;
      const th = Math.max(1, Math.round(4 * (1 - u)));
      R(f, PAL.dgreen, x, y - 1, 2, th + 2);
      R(f, PAL.green, x, y, 2, th);
      if (s % 3 === 0) { R(f, PAL.dgreen, x, y + th + 1, 1, 3); R(f, PAL.dgreen, x + 1, y - 3, 1, 2); }
      if (s % 5 === 2 && u < 0.7) R(f, PAL.lgreen, x, y);
    }
  }
  disc(f, PAL.dbrown, topX - 3, topY + 4, 2.5); disc(f, PAL.brown, topX + 2, topY + 5, 2.5);

  const glints = Array.from({ length: 40 }, () => [rnd() * W, 104 + rnd() * 32, rnd() * 6]);

  return {
    name: 'SUNSET SHORE', ja: '夕暮れの浜辺', shadow: PAL.tan, bg, fg, front,
    mid(g, t) {
      for (let i = 0; i < 3; i++) {
        const x = Math.round(((t * (0.3 + i * 0.07) + i * 90) % (W + 40)) - 20);
        const y = 40 + i * 12 + Math.round(sin(t * 0.02 + i * 2) * 4);
        const up = ((t >> 3) + i) % 3 === 0;
        R(g, PAL.deep, x, y, 1, 1);
        R(g, PAL.deep, x - 3, up ? y - 2 : y - 1, 3, 1); R(g, PAL.deep, x + 1, up ? y - 2 : y - 1, 3, 1);
      }
    },
    fx(g, t) {
      // sun reflection column
      for (let y = 103; y < 137; y += 2) {
        const spread = 6 + (y - 100) * 0.7;
        for (let k = 0; k < 3; k++) {
          const off = sin(t * 0.07 + y * 0.9 + k * 2.1) * spread;
          const len = 2 + Math.floor(hash(y + k, t >> 3) * 6);
          R(g, k === 0 && y < 118 ? PAL.cream : y < 120 ? PAL.yellow : PAL.orange, 200 + off - len / 2, y, len, 1);
        }
      }
      for (const [x0, y, ph] of glints) {
        const x = (x0 + t * 0.15) % W;
        if (sin(t * 0.05 + ph) > 0.4) R(g, y < 118 ? PAL.pink : PAL.rose, x, y, 3, 1);
      }
      // waves lapping at the shore
      const tide = sin(t * 0.025) * 3;
      for (let x = 0; x < W; x++) {
        const y = Math.round(138 + tide + sin(x * 0.07 + t * 0.04) * 1.5);
        R(g, PAL.white, x, y, 1, 1);
        R(g, PAL.ice, x, y + 1, 1, 1);
        if (hash(x, t >> 4) > 0.7) R(g, PAL.white, x, y - 1);
        if (tide > 0) R(g, PAL.tan, x, y + 2, 1, 1);
      }
      // crab
      const cx = 160 + sin(t * 0.012) * 50, cy = 166;
      const step = (t >> 3) % 2;
      R(g, PAL.red, cx - 4, cy - 3, 9, 4); R(g, PAL.rust, cx - 4, cy, 9, 1);
      R(g, PAL.ink, cx - 2, cy - 5, 1, 2); R(g, PAL.ink, cx + 2, cy - 5, 1, 2);
      R(g, PAL.red, cx - 7, cy - 5, 3, 2); R(g, PAL.red, cx + 5, cy - 5, 3, 2);
      for (let l = 0; l < 3; l++) {
        R(g, PAL.rust, cx - 6 + l, cy + 1 + ((l + step) % 2)); R(g, PAL.rust, cx + 4 + l, cy + 1 + ((l + step + 1) % 2));
      }
    },
  };
}

export function buildScenes() {
  return [meadow(), town(), cave(), shore()];
}
