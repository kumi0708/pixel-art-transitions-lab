// Generates every figure used in the README.
// Open tools/figures.html in a browser to preview them, or run
// `python3 tools/export_figures.py` to write them into docs/img/.
//
// Each figure is emitted as one or more PNG frames (data URLs) into
// <script id="out" type="application/json">; the exporter turns multi-frame
// figures into GIFs.

import {
  W, H, PAL, PALETTE, COVER, BAYER8, hexToRgb, makeCanvas, R, ellipse,
  drawText, textWidth, drawHero,
} from '../src/art.js';
import { buildScenes } from '../src/scenes.js';
import { STYLES, PARAMS, renderTransition } from '../src/transitions.js';
import { TransitionController, TIMING, TOTAL } from '../src/controller.js';

const scenes = buildScenes();
const COVER_RGB = hexToRgb(COVER);
const PAL_SET = new Set(PALETTE.map((h) => { const [r, g, b] = hexToRgb(h); return (r << 16) | (g << 8) | b; }));
const OUT = {};
const only = new URLSearchParams(location.search).get('only'); // optional comma list

// ───────────────────────── helpers ─────────────────────────
function canvas(w, h, bg = PAL.ink) {
  const [c, g] = makeCanvas(w, h);
  if (bg) R(g, bg, 0, 0, w, h);
  return [c, g];
}
function blit(g, src, x, y, s = 1, sx = 0, sy = 0, sw = src.width, sh = src.height) {
  g.imageSmoothingEnabled = false;
  g.drawImage(src, sx, sy, sw, sh, x, y, sw * s, sh * s);
}
/** Pixel-font text, scaled by s. Returns width in px. */
function txt(g, str, x, y, s = 2, color = PAL.cream, shadow = PAL.black) {
  const [t, tg] = makeCanvas(str.length * 4 + 2, 7);
  drawText(tg, str, 0, 0, color, shadow);
  blit(g, t, Math.round(x), Math.round(y), s);
  return (str.length * 4 - 1) * s;
}
const tw = (str, s = 2) => (str.length * 4 - 1) * s;
function frameBox(g, x, y, w, h, c = PAL.deep) { R(g, c, x - 2, y - 2, w + 4, 2); R(g, c, x - 2, y + h, w + 4, 2); R(g, c, x - 2, y, 2, h); R(g, c, x + w, y, 2, h); }
function emit(name, frames, { delay = 33, scale = 1 } = {}) {
  const list = Array.isArray(frames) ? frames : [frames];
  OUT[name] = { frames: list.map((c) => c.toDataURL('image/png')), delay, scale };
}
const want = (name) => !only || only.split(',').some((k) => name.startsWith(k));

function game(sceneIdx, t, hero, hud = true) {
  const [c, g] = makeCanvas();
  const s = scenes[sceneIdx];
  g.drawImage(s.bg, 0, 0);
  s.mid?.(g, t);
  g.drawImage(s.fg, 0, 0);
  s.fx?.(g, t);
  if (s.front) g.drawImage(s.front, 0, 0);
  if (hero) drawHeroLayer(g, s, hero);
  if (hud) drawHud(g, sceneIdx);
  return c;
}
function drawHeroLayer(g, s, hero) {
  ellipse(g, s.shadow, hero.x, hero.y, 5, 1.5);
  drawHero(g, hero.x, hero.y, hero.pose || 'idle', !!hero.flip);
}
function drawHud(g, sceneIdx) {
  const label = `${sceneIdx + 1}/${scenes.length} ${scenes[sceneIdx].name}`;
  const w = textWidth(label) + 8;
  R(g, PAL.ink, 4, 4, w, 11); R(g, PAL.deep, 5, 5, w - 2, 9);
  R(g, PAL.yellow, 5, 5, 2, 1); R(g, PAL.yellow, 5, 5, 1, 2);
  drawText(g, label, 8, 7, PAL.cream, PAL.ink);
}
const px = (c) => c.getContext('2d').getImageData(0, 0, c.width, c.height);
function trans(frame, style, p, opt = {}) {
  const src = px(frame).data;
  const [c, g] = makeCanvas(frame.width, frame.height);
  const out = g.createImageData(frame.width, frame.height);
  renderTransition(src, out.data, frame.width, frame.height, style, p,
    { reverse: false, center: { x: W / 2, y: H / 2 }, cover: COVER_RGB, ...opt });
  g.putImageData(out, 0, 0);
  return c;
}
function upscale(c, s) { const [o, g] = makeCanvas(c.width * s, c.height * s); blit(g, c, 0, 0, s); return o; }
function foreignColors(c) {
  const d = px(c).data, set = new Set();
  for (let i = 0; i < d.length; i += 4) { const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]; if (!PAL_SET.has(k)) set.add(k); }
  return set;
}
// "early → late" ramp for threshold maps (diagram colours, not game colours)
const RAMP = ['#fff4d6', '#ffd75e', '#f59a3a', '#c2577a', '#7a3f6e', '#3a6fb0', '#16213e'].map(hexToRgb);
function ramp(t) {
  t = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
  const i = Math.min(Math.floor(t), RAMP.length - 2), f = t - i;
  const a = RAMP[i], b = RAMP[i + 1];
  return [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * f));
}
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
const heroC = (h) => ({ x: h.x, y: h.y - 8 });

/** Run one full transition through the real controller and capture frames. */
function simulate({ from, to, style, heroFrom, heroTo, pre = 8, post = 8, every = 2, t0 = 40, reaim = true, useReverse = true }) {
  const ctrl = new TransitionController();
  let scene = from, hero = { ...heroFrom }, center = heroC(hero), t = t0;
  const frames = [];
  const snap = () => frames.push(trans(game(scene, t, hero), style, ctrl.progress,
    { reverse: useReverse ? ctrl.reverse : false, center }));
  for (let i = 0; i < pre; i++) { t++; if (i % every === 0) snap(); }
  ctrl.request({
    onLoad: () => { scene = to; hero = { ...heroTo }; },
    onReaim: () => { if (reaim) center = heroC(hero); },
  });
  for (let i = 0; ctrl.active; i++) { ctrl.tick(); t++; if (i % every === 0) snap(); }
  for (let i = 0; i < post; i++) { t++; if (i % every === 0) snap(); }
  return frames;
}

// ───────────────────────── 1. hero tour GIF ─────────────────────────
function figTour() {
  const styles = ['dither', 'iris', 'diamonds', 'wipe'];
  const ctrl = new TransitionController();
  let scene = 0, t = 0, walk = 0, done = 0, style = styles[0];
  const hero = { x: 190, y: 160, pose: 'a' };
  let center = heroC(hero);
  const frames = [];
  while (done < 4) {
    t++;
    const paused = ctrl.active;
    ctrl.tick();
    if (!paused && ctrl.t < 0) {
      hero.x += 1.2; walk++;
      hero.pose = (walk >> 3) % 2 ? 'b' : 'a';
      if (hero.x > W - 4) {
        style = styles[done];
        center = heroC(hero);
        hero.pose = 'idle';
        ctrl.request({
          onLoad: () => { scene = (scene + 1) % 4; hero.x = 190; hero.y = 160; },
          onReaim: () => { center = heroC(hero); },
          onDone: () => { done++; },
        });
      }
    }
    if (t % 3 === 0) {
      const f = trans(game(scene, t, hero), style, ctrl.progress, { reverse: ctrl.reverse, center });
      frames.push(f);
    }
  }
  emit('tour', frames, { delay: 50, scale: 2 });
}

// ───────────────────────── 2. per-style animations ─────────────────────────
function figStyleAnims() {
  STYLES.forEach((st, i) => {
    const frames = simulate({
      from: i % 4, to: (i + 1) % 4, style: st.id,
      heroFrom: { x: 200, y: 160 }, heroTo: { x: 110, y: 158, flip: true },
    });
    emit(`anim-${st.id}`, frames, { delay: 33, scale: 2 });
  });
}

// ───────────────────────── 3. per-style progress strips ─────────────────────────
function figStrips() {
  STYLES.forEach((st, i) => {
    const ps = st.id === 'pixelate' ? [0.1, 0.2, 0.4, 0.55, 0.7, 0.9] : [0.1, 0.25, 0.4, 0.55, 0.7, 0.85];
    const pad = 6, head = 18;
    const [c, g] = canvas(3 * W + 4 * pad, 2 * (H + head) + 3 * pad);
    const hero = { x: 200, y: 160 };
    const base = game(i % 2 ? 3 : 0, 60, hero);
    ps.forEach((p, k) => {
      const x = pad + (k % 3) * (W + pad), y = pad + Math.floor(k / 3) * (H + head + pad);
      txt(g, `P = ${p.toFixed(2)}`, x, y + 2, 2, PAL.yellow);
      if (st.id === 'pixelate') txt(g, `BLOCK ${Math.floor(p * 6) >= 5 ? 'BLACK' : 2 ** Math.floor(p * 6)}`, x + 130, y + 2, 2, PAL.grey3);
      if (st.id === 'stepped') txt(g, `ALPHA ${Math.floor(p * 4) * 25}%`, x + 130, y + 2, 2, PAL.grey3);
      blit(g, trans(base, st.id, p, { center: heroC(hero) }), x, y + head);
    });
    emit(`strip-${st.id}`, c);
  });
}

// ───────────────────────── 4. threshold ("time to black") maps ─────────────────────────
function pBlackMap(style, opt = {}) {
  const N = 264;
  const white = new Uint8ClampedArray(W * H * 4).fill(255);
  const out = new Uint8ClampedArray(W * H * 4);
  const map = new Float32Array(W * H).fill(1);
  for (let k = N; k >= 1; k--) {
    renderTransition(white, out, W, H, style, k / N, { reverse: false, center: { x: W / 2, y: H / 2 }, ...opt, cover: [0, 0, 0] });
    for (let i = 0; i < W * H; i++) if (out[i * 4] === 0) map[i] = k / N;
  }
  return map;
}
function figMaps() {
  const specs = {
    dither: { inset: [0, 0, 40, 30], unit: 2, major: 16, note: '2PX BLOCKS, 16PX = ONE 8X8 TILE' },
    iris: { inset: [92, 46, 40, 30], unit: 0, opt: { center: { x: 200, y: 152 } }, binary: 0.5, note: 'REAL FRAME AT P = 0.5: STAIR-STEPPED CIRCLE EDGE' },
    wipe: { inset: [96, 48, 40, 30], unit: 6, note: '6PX STAIRS' },
    diamonds: { inset: [96, 48, 40, 30], unit: 12, note: '12PX TILES, DELAY GROWS TO BOTTOM-RIGHT' },
    shutters: { inset: [0, 0, 40, 30], unit: 8, horizontal: true, note: '8PX BANDS FILL TOP ROW FIRST' },
  };
  for (const [id, sp] of Object.entries(specs)) {
    const map = pBlackMap(id, sp.opt);
    const [m, mg] = makeCanvas(W, H);
    const img = mg.createImageData(W, H);
    for (let i = 0; i < W * H; i++) { const [r, gg, b] = ramp(map[i]); img.data.set([r, gg, b, 255], i * 4); }
    mg.putImageData(img, 0, 0);

    const S = 9, [ix, iy, iw, ih] = sp.inset;
    const pad = 16, top = 30;
    const [c, g] = canvas(pad + 640 + pad + iw * S + pad, top + 360 + 56);
    txt(g, `${id.toUpperCase()} - WHEN DOES EACH PIXEL TURN BLACK?`, pad, 8, 2, PAL.yellow);
    blit(g, m, pad, top, 2);
    frameBox(g, pad, top, 640, 360);
    // inset marker
    g.strokeStyle = PAL.white; g.lineWidth = 2;
    g.strokeRect(pad + ix * 2 - 1, top + iy * 2 - 1, iw * 2 + 2, ih * 2 + 2);
    // zoomed inset with per-pixel grid
    const zx = pad + 640 + pad, zy = top;
    const insetSrc = sp.binary ? trans(game(0, 60, { x: 200, y: 160 }, false), id, sp.binary, sp.opt) : m;
    blit(g, insetSrc, zx, zy, S, ix, iy, iw, ih);
    g.fillStyle = 'rgba(11,10,18,0.35)';
    for (let x = 0; x <= iw; x++) g.fillRect(zx + x * S, zy, 1, ih * S);
    for (let y = 0; y <= ih; y++) g.fillRect(zx, zy + y * S, iw * S, 1);
    if (sp.unit) {
      g.fillStyle = PAL.white;
      for (let x = 0; x <= iw; x++) if (!sp.horizontal && (ix + x) % sp.unit === 0) g.fillRect(zx + x * S - 1, zy, 2, ih * S);
      for (let y = 0; y <= ih; y++) if ((iy + y) % sp.unit === 0) g.fillRect(zx, zy + y * S - 1, iw * S, 2);
      if (sp.major) {
        g.fillStyle = PAL.red;
        for (let x = 0; x <= iw; x++) if ((ix + x) % sp.major === 0) g.fillRect(zx + x * S - 1, zy, 3, ih * S);
        for (let y = 0; y <= ih; y++) if ((iy + y) % sp.major === 0) g.fillRect(zx, zy + y * S - 1, iw * S, 3);
      }
    }
    frameBox(g, zx, zy, iw * S, ih * S);
    txt(g, `ZOOM X${S}: ${sp.note}`, zx, zy + ih * S + 10, 1, PAL.grey3);
    // legend
    const ly = top + 360 + 14;
    for (let x = 0; x < 640; x++) { g.fillStyle = rgb(ramp(x / 639)); g.fillRect(pad + x, ly, 1, 12); }
    txt(g, 'P = 0  BLACK FIRST', pad, ly + 18, 2, PAL.cream);
    const lt = 'P = 1  BLACK LAST'; txt(g, lt, pad + 640 - tw(lt), ly + 18, 2, PAL.cream);
    emit(`map-${id}`, c);
  }
}

// ───────────────────────── 5. Bayer matrix ─────────────────────────
function figBayer() {
  const cell = 48, pad = 16, top = 34;
  const [c, g] = canvas(pad + 8 * cell + 32 + 3 * (16 * 7 + 20) + pad, top + 8 * cell + 44);
  txt(g, 'BAYER 8X8   THRESHOLD T = (B + 0.5) / 64   BLACK IF P > T', pad, 10, 2, PAL.yellow);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const v = BAYER8[y * 8 + x];
    g.fillStyle = rgb(ramp(v / 63));
    g.fillRect(pad + x * cell, top + y * cell, cell - 2, cell - 2);
    const s = String(v);
    txt(g, s, pad + x * cell + (cell - 2 - tw(s, 3)) / 2, top + y * cell + 10, 3, v < 32 ? PAL.ink : PAL.white, null);
  }
  txt(g, 'LOW NUMBERS TURN BLACK FIRST, SPREAD EVENLY OVER THE TILE', pad, top + 8 * cell + 12, 1, PAL.grey3);
  // the resulting pattern for one 16x16 tile (2px blocks)
  const ox = pad + 8 * cell + 32, S = 7;
  [0.25, 0.5, 0.75].forEach((p, k) => {
    const x = ox + k * (16 * S + 20);
    txt(g, `P = ${p}`, x, top - 2, 2, PAL.cream);
    for (let yy = 0; yy < 16; yy++) for (let xx = 0; xx < 16; xx++) {
      const t = (BAYER8[((yy >> 1) & 7) * 8 + ((xx >> 1) & 7)] + 0.5) / 64;
      g.fillStyle = p > t ? COVER : PAL.sky;
      g.fillRect(x + xx * S, top + 18 + yy * S, S, S);
    }
    frameBox(g, x, top + 18, 16 * S, 16 * S, PAL.grey1);
    txt(g, `${Math.round(p * 100)}% BLACK`, x, top + 18 + 16 * S + 10, 2, PAL.grey3);
  });
  txt(g, 'ONE 16X16 TILE = 8X8 BLOCKS OF 2X2 PX', ox, top + 18 + 16 * S + 36, 1, PAL.grey3);
  emit('bayer', c);
}

// ───────────────────────── 6. pixelate stages + sampling ─────────────────────────
function figPixelate() {
  const base = game(0, 60, { x: 200, y: 160 });
  const [cx, cy, cw, ch] = [24, 80, 64, 48], S = 4, pad = 8, head = 20;
  const [c, g] = canvas(3 * (cw * S + pad) + pad, 2 * (ch * S + head + pad) + pad);
  const ps = [0.05, 0.2, 0.36, 0.52, 0.7, 0.9];
  ps.forEach((p, i) => {
    const k = Math.floor(p * 6), b = 2 ** k;
    const x = pad + (i % 3) * (cw * S + pad), y = pad + Math.floor(i / 3) * (ch * S + head + pad);
    txt(g, k >= 5 ? `K = ${k}  BLACK` : `K = ${k}  BLOCK ${b}PX`, x, y + 2, 2, PAL.yellow);
    const f = trans(base, 'pixelate', p);
    blit(g, f, x, y + head, S, cx, cy, cw, ch);
    if (k < 5 && b >= 2) {
      g.fillStyle = 'rgba(244,244,248,0.55)';
      for (let gx = Math.ceil(cx / b) * b; gx <= cx + cw; gx += b) g.fillRect(x + (gx - cx) * S, y + head, 1, ch * S);
      for (let gy = Math.ceil(cy / b) * b; gy <= cy + ch; gy += b) g.fillRect(x, y + head + (gy - cy) * S, cw * S, 1);
      if (b >= 4) { // mark the sampled centre pixel of each block
        g.strokeStyle = PAL.red; g.lineWidth = 1;
        for (let by = Math.floor(cy / b) * b; by < cy + ch; by += b) for (let bx = Math.floor(cx / b) * b; bx < cx + cw; bx += b) {
          const sx = bx + (b >> 1) - cx, sy = by + (b >> 1) - cy;
          if (sx >= 0 && sy >= 0 && sx < cw && sy < ch) g.strokeRect(x + sx * S + 0.5, y + head + sy * S + 0.5, S - 1, S - 1);
        }
      }
    }
    frameBox(g, x, y + head, cw * S, ch * S);
  });
  emit('pixelate-stages', c);

  // centre-pixel copy vs block average
  const b = 8;
  const copy = trans(base, 'pixelate', 0.52);
  const src = px(base);
  const [avg, ag] = makeCanvas();
  const out = ag.createImageData(W, H);
  for (let by = 0; by < H; by += b) for (let bx = 0; bx < W; bx += b) {
    let r = 0, gg = 0, bb = 0, n = 0;
    for (let y = by; y < Math.min(by + b, H); y++) for (let x = bx; x < Math.min(bx + b, W); x++) {
      const i = (y * W + x) * 4; r += src.data[i]; gg += src.data[i + 1]; bb += src.data[i + 2]; n++;
    }
    for (let y = by; y < Math.min(by + b, H); y++) for (let x = bx; x < Math.min(bx + b, W); x++) {
      out.data.set([Math.round(r / n), Math.round(gg / n), Math.round(bb / n), 255], (y * W + x) * 4);
    }
  }
  ag.putImageData(out, 0, 0);
  const S2 = 5, pad2 = 10, head2 = 44;
  const [c2, g2] = canvas(2 * (cw * S2 + pad2) + pad2, ch * S2 + head2 + pad2 * 2);
  [[copy, 'CENTRE PIXEL (USED)', PAL.lime], [avg, 'BLOCK AVERAGE (AVOID)', PAL.red]].forEach(([img, label, col], i) => {
    const x = pad2 + i * (cw * S2 + pad2);
    txt(g2, label, x, pad2, 2, col);
    txt(g2, `NEW COLOURS IN FRAME: ${foreignColors(img).size}`, x, pad2 + 20, 2, PAL.cream);
    blit(g2, img, x, head2, S2, cx, cy, cw, ch);
    frameBox(g2, x, head2, cw * S2, ch * S2);
  });
  emit('pixelate-sampling', c2);
}

// ───────────────────────── 7. timing diagram ─────────────────────────
function figTimeline() {
  const ctrl = new TransitionController();
  const prog = [0], rev = [false];
  ctrl.request({});
  for (let t = 1; t <= 90; t++) { ctrl.tick(); prog.push(ctrl.progress); rev.push(ctrl.reverse); }
  const [c, g] = canvas(980, 400);
  const x0 = 76, x1 = 950, yTop = 70, yBot = 240;
  const X = (t) => x0 + (t / 90) * (x1 - x0);
  const Y = (p) => yBot - p * (yBot - yTop);
  txt(g, 'SHARED TIMING @ 60 TICKS/S  (SAME FOR EVERY STYLE)', x0, 12, 2, PAL.yellow);
  const phases = [[0, 33, '#f59a3a', 'COVER 33'], [33, 42, '#4a2f5e', 'HOLD 9'], [42, 75, '#3aa0a8', 'UNCOVER 33'], [75, 84, '#6a6a80', 'WAIT 9']];
  for (const [a, b, col, name] of phases) {
    g.fillStyle = col; g.globalAlpha = 0.28; g.fillRect(X(a), yTop, X(b) - X(a), yBot - yTop); g.globalAlpha = 1;
    g.fillRect(X(a), yTop - 22, X(b) - X(a) - 2, 18);
    txt(g, name, X(a) + 4, yTop - 19, 2, PAL.ink, null);
  }
  // axes
  R(g, PAL.grey2, x0, yBot, x1 - x0, 2); R(g, PAL.grey2, x0 - 2, yTop, 2, yBot - yTop + 2);
  for (let t = 0; t <= 90; t += 10) { R(g, PAL.grey2, X(t), yBot, 2, 6); txt(g, String(t), X(t) - tw(String(t), 1) / 2, yBot + 10, 1, PAL.grey3); }
  txt(g, '1', x0 - 16, Y(1) - 3, 2, PAL.grey3); txt(g, '0', x0 - 16, Y(0) - 8, 2, PAL.grey3);
  txt(g, 'PROGRESS', 4, yTop + 70, 1, PAL.grey3);
  txt(g, 'TICK', x1 - 16, yBot + 22, 1, PAL.grey3);
  // stepped progress line
  g.fillStyle = PAL.cream;
  for (let t = 0; t < 90; t++) {
    g.fillRect(X(t), Y(prog[t]) - 1, X(t + 1) - X(t) + 1, 3);
    if (t + 1 <= 90 && prog[t + 1] !== prog[t]) g.fillRect(X(t + 1) - 1, Math.min(Y(prog[t]), Y(prog[t + 1])) - 1, 3, Math.abs(Y(prog[t]) - Y(prog[t + 1])) + 3);
  }
  // event markers
  const events = [[0, 'REQUEST', PAL.cream], [34, 'LOAD SCENE', PAL.yellow], [43, 'RE-AIM IRIS', PAL.sky], [84, 'UNPAUSE', PAL.pink], [85, 'FIRST MOVE', PAL.lime]];
  events.forEach(([t, name, col], i) => {
    g.fillStyle = col;
    for (let y = yTop; y < yBot; y += 6) g.fillRect(X(t), y, 2, 3);
    const ly = yBot + 30 + (i % 2) * 16;
    const lx = Math.min(X(t) - (t > 80 ? tw(`${t} ${name}`, 1) : 0), x1 - tw(`${t} ${name}`, 1));
    txt(g, `${t} ${name}`, lx, ly, 1, col);
  });
  // state bars
  const bar = (row, label, from, to, col) => {
    const y = 330 + row * 20;
    txt(g, label, 4, y - 1, 2, PAL.grey3);
    g.fillStyle = col; g.fillRect(X(from), y, X(to) - X(from), 12);
  };
  bar(0, 'PAUSED', 0, 85, PAL.rose);
  bar(1, 'REVERSE', 43, 76, PAL.cyan);
  bar(2, 'VISIBLE', 1, 76, PAL.orange);
  emit('timeline', c);
}

// ───────────────────────── 8. off-palette colour counts ─────────────────────────
function figColors() {
  const curves = {}, sets = {};
  for (const st of STYLES) {
    const all = new Set(), curve = [0];
    for (let k = 1; k <= TIMING.out; k++) {
      const f = trans(game(0, 100 + k, { x: 200, y: 160 }), st.id, k / TIMING.out, { center: { x: 200, y: 152 } });
      for (const c of foreignColors(f)) all.add(c);
      curve.push(all.size);
    }
    curves[st.id] = curve; sets[st.id] = all;
  }
  const [c, g] = canvas(980, 380);
  const x0 = 70, x1 = 760, yTop = 50, yBot = 320;
  const max = Math.ceil(curves.fade[TIMING.out] / 100) * 100;
  const X = (t) => x0 + (t / TIMING.out) * (x1 - x0), Y = (v) => yBot - (v / max) * (yBot - yTop);
  txt(g, 'OFF-PALETTE COLOURS CREATED DURING ONE COVER (33 TICKS)', x0, 12, 2, PAL.yellow);
  for (let v = 0; v <= max; v += 100) { R(g, PAL.deep, x0, Y(v), x1 - x0, 1); txt(g, String(v), x0 - 8 - tw(String(v), 1), Y(v) - 3, 1, PAL.grey3); }
  R(g, PAL.grey2, x0, yBot, x1 - x0, 2);
  for (let t = 0; t <= 33; t += 3) txt(g, String(t), X(t) - 3, yBot + 8, 1, PAL.grey3);
  txt(g, 'TICK', x1 - 16, yBot + 22, 1, PAL.grey3);
  const cols = { fade: PAL.red, stepped: PAL.orange };
  for (const st of STYLES) {
    const col = cols[st.id] || PAL.lime;
    const cv = curves[st.id];
    g.fillStyle = col;
    for (let t = 1; t <= 33; t++) {
      g.fillRect(X(t - 1), Y(cv[t - 1]) - 1, X(t) - X(t - 1) + 2, 3);
      g.fillRect(X(t), Math.min(Y(cv[t - 1]), Y(cv[t])) - 1, 3, Math.abs(Y(cv[t]) - Y(cv[t - 1])) + 3);
    }
  }
  txt(g, `FADE  ${curves.fade[33]}`, x1 + 14, Y(curves.fade[33]) - 6, 2, PAL.red);
  txt(g, `STEPPED  ${curves.stepped[33]}`, x1 + 14, Y(curves.stepped[33]) - 14, 2, PAL.orange);
  const zero = STYLES.filter((s) => curves[s.id][33] === 0).map((s) => s.en.toUpperCase());
  txt(g, 'ZERO NEW COLOURS:', x1 + 14, Y(560), 2, PAL.lime);
  zero.forEach((n, i) => txt(g, n, x1 + 14, Y(560) + 22 + i * 16, 2, PAL.lime));
  emit('colors-chart', c);

  // swatches: the palette vs. the colours fade invented
  const sq = 10, cols2 = 90, pad = 14;
  const sorted = (set) => [...set].sort((a, b) => {
    const l = (v) => 0.3 * (v >> 16) + 0.59 * ((v >> 8) & 255) + 0.11 * (v & 255);
    return l(a) - l(b);
  });
  const fadeC = sorted(sets.fade), stepC = sorted(sets.stepped);
  const rows = (n) => Math.ceil(n / cols2);
  const h = 30 + 28 + 30 + 30 + rows(fadeC.length) * sq + 30 + rows(stepC.length) * sq + pad;
  const [c2, g2] = canvas(pad * 2 + cols2 * sq, h);
  let y = 8;
  txt(g2, `THE GAME'S PALETTE: ${PALETTE.length} COLOURS`, pad, y, 2, PAL.yellow); y += 22;
  PALETTE.forEach((hex, i) => { g2.fillStyle = hex; g2.fillRect(pad + i * 28, y, 26, 26); }); y += 40;
  txt(g2, `NEW COLOURS INVENTED BY FADE: ${fadeC.length}`, pad, y, 2, PAL.red); y += 22;
  fadeC.forEach((v, i) => { g2.fillStyle = `#${v.toString(16).padStart(6, '0')}`; g2.fillRect(pad + (i % cols2) * sq, y + Math.floor(i / cols2) * sq, sq, sq); });
  y += rows(fadeC.length) * sq + 12;
  txt(g2, `BY STEPPED FADE: ${stepC.length}      BY THE OTHER 6 STYLES: 0`, pad, y, 2, PAL.orange); y += 22;
  stepC.forEach((v, i) => { g2.fillStyle = `#${v.toString(16).padStart(6, '0')}`; g2.fillRect(pad + (i % cols2) * sq, y + Math.floor(i / cols2) * sq, sq, sq); });
  emit('colors-swatches', c2);
}

// ───────────────────────── 9. pixel_size: game pixels vs screen pixels ─────────────────────────
function figPixelSize() {
  const base = game(0, 60, { x: 200, y: 160 }, false);
  const big = upscale(base, 4);
  const cases = [['dither', 0.5, [100, 40, 48, 36]], ['wipe', 0.37, [100, 40, 48, 36]]];
  const S = 2, pad = 12, head = 24, pw = 48 * 4 * S, ph = 36 * 4 * S;
  const [c, g] = canvas(2 * (pw + pad) + pad, 2 * (ph + head + pad) + pad + 10);
  cases.forEach(([style, p, [cx, cy, cw, ch]], row) => {
    const good = upscale(trans(base, style, p), 4);
    const bad = trans(big, style, p);
    [[good, `${style.toUpperCase()}: FLOOR(FRAG / PIXEL_SIZE)`, PAL.lime], [bad, `${style.toUpperCase()}: RAW SCREEN PIXELS`, PAL.red]].forEach(([img, label, col], i) => {
      const x = pad + i * (pw + pad), y = pad + row * (ph + head + pad);
      txt(g, label, x, y + 4, 2, col);
      blit(g, img, x, y + head, S, cx * 4, cy * 4, cw * 4, ch * 4);
      frameBox(g, x, y + head, pw, ph);
    });
  });
  emit('pixel-size', c);
}

// ───────────────────────── 10. side-by-side comparison GIFs ─────────────────────────
function sideBySide(name, a, b, labelA, labelB) {
  const pad = 6, head = 22;
  const frames = a.map((fa, i) => {
    const [c, g] = canvas(2 * W + 3 * pad, H + head + pad);
    txt(g, labelA, pad, 6, 2, PAL.lime);
    txt(g, labelB, 2 * pad + W, 6, 2, PAL.red);
    blit(g, fa, pad, head);
    blit(g, b[i], 2 * pad + W, head);
    return c;
  });
  emit(name, frames, { delay: 33, scale: 1 });
}
function figComparisons() {
  const args = { from: 0, to: 1, style: 'wipe', heroFrom: { x: 200, y: 160 }, heroTo: { x: 110, y: 158, flip: true } };
  sideBySide('reverse', simulate({ ...args, useReverse: true }), simulate({ ...args, useReverse: false }),
    'REVERSE ON', 'REVERSE OFF (BOUNCES)');
  const iris = { from: 2, to: 3, style: 'iris', heroFrom: { x: 286, y: 162 }, heroTo: { x: 104, y: 166, flip: true } };
  sideBySide('iris-reaim', simulate({ ...iris, reaim: true }), simulate({ ...iris, reaim: false }),
    'RE-AIM AT NEW HERO', 'FIXED CENTRE');
}

// ───────────────────────── 11. art breakdown ─────────────────────────
function checker(g, x, y, w, h, light = false) {
  const [a, b] = light ? ['#d8d8e2', '#c4c4d2'] : [PAL.deep, '#221a35'];
  for (let yy = 0; yy < h; yy += 4) for (let xx = 0; xx < w; xx += 4) {
    g.fillStyle = ((xx + yy) >> 2) % 2 ? a : b;
    g.fillRect(x + xx, y + yy, Math.min(4, w - xx), Math.min(4, h - yy));
  }
}
function figLayers() {
  const si = 3, s = scenes[si], t = 120, hero = { x: 150, y: 160 };
  const layer = (fn) => { const [c, g] = makeCanvas(); fn(g); return c; };
  const tiles = [
    ['1 BG  (STATIC, CACHED)', s.bg],
    ['2 MID  (ANIMATED)', layer((g) => s.mid?.(g, t))],
    ['3 FG  (STATIC, CACHED)', s.fg],
    ['4 FX  (ANIMATED)', layer((g) => s.fx?.(g, t))],
    ['5 FRONT  (STATIC)', s.front],
    ['6 HERO + HUD', layer((g) => { drawHeroLayer(g, s, hero); drawHud(g, si); })],
    ['= FRAME  (32 COLOURS)', game(si, t, hero)],
    ['+ TRANSITION (DITHER 0.5)', trans(game(si, t, hero), 'dither', 0.5)],
  ];
  const pad = 8, head = 20;
  const [c, g] = canvas(2 * (W + pad) + pad, 4 * (H + head + pad) + pad);
  tiles.forEach(([label, img], i) => {
    const x = pad + (i % 2) * (W + pad), y = pad + Math.floor(i / 2) * (H + head + pad);
    txt(g, label, x, y + 3, 2, i >= 6 ? PAL.yellow : PAL.cream);
    checker(g, x, y + head, W, H, i > 0 && i < 6);
    blit(g, img, x, y + head);
  });
  emit('layers', c);
}
function figZoomArt() {
  const meadowBg = scenes[0].bg;
  const town = game(1, 30, null, false);
  const cave = game(2, 30, null, false);
  const S = 8, cw = 40, ch = 32, pad = 12, head = 24;
  const panels = [
    ['DITHERED GRADIENT', meadowBg, 0, 34, 'SKY: NEIGHBOUR PALETTE COLOURS MIXED BY 4X4 BAYER'],
    ['DITHERED GLOW', town, 98, 84, 'LAMP: DENSITY FALLS WITH DISTANCE'],
    ['TORCH + GLOW', cave, 56, 58, 'FLAME SHAPE + 2 GLOW RINGS'],
  ];
  const [c, g] = canvas(3 * (cw * S + pad) + pad, ch * S + head + 30 + pad);
  panels.forEach(([label, img, sx, sy, note], i) => {
    const x = pad + i * (cw * S + pad);
    txt(g, label, x, pad - 2, 2, PAL.yellow);
    blit(g, img, x, head, S, sx, sy, cw, ch);
    frameBox(g, x, head, cw * S, ch * S);
    txt(g, note, x, head + ch * S + 10, 1, PAL.grey3);
  });
  emit('art-zoom', c);
}
function figSprite() {
  const S = 10, pad = 16, head = 30;
  const poses = [['IDLE', 'idle', false], ['WALK A', 'a', false], ['WALK B', 'b', false], ['FLIPPED', 'a', true]];
  const [c, g] = canvas(pad + poses.length * (12 * S + pad), head + 17 * S + 80);
  poses.forEach(([label, pose, flip], i) => {
    const x = pad + i * (12 * S + pad);
    txt(g, label, x, 8, 2, PAL.yellow);
    const [sp, sg] = makeCanvas(12, 17);
    drawHero(sg, 6, 16 + (pose === 'b' ? 1 : 0), pose, flip);
    checker(g, x, head, 12 * S, 17 * S);
    blit(g, sp, x, head, S);
    g.fillStyle = 'rgba(11,10,18,0.35)';
    for (let k = 0; k <= 12; k++) g.fillRect(x + k * S, head, 1, 17 * S);
    for (let k = 0; k <= 17; k++) g.fillRect(x, head + k * S, 12 * S, 1);
  });
  const fy = head + 17 * S + 14;
  txt(g, '3X5 FONT:', pad, fy, 2, PAL.yellow);
  txt(g, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', pad, fy + 20, 3, PAL.cream);
  txt(g, '0123456789 .,:!?-+=/<>()%#', pad, fy + 44, 3, PAL.cream);
  emit('sprite', c);
}
function figPalette() {
  const names = Object.keys(PAL);
  const cw = 104, ch = 74, pad = 8;
  const [c, g] = canvas(8 * (cw + pad) + pad, 4 * (ch + pad) + pad + 26);
  txt(g, '32-COLOUR PALETTE  (EVERY GAME PIXEL IS ONE OF THESE)', pad, 8, 2, PAL.yellow);
  names.forEach((n, i) => {
    const x = pad + (i % 8) * (cw + pad), y = 26 + pad + Math.floor(i / 8) * (ch + pad);
    g.fillStyle = PAL[n]; g.fillRect(x, y, cw, 44);
    txt(g, n.toUpperCase(), x, y + 50, 2, PAL.cream);
    txt(g, PAL[n].toUpperCase(), x + 50, y + 66, 1, PAL.grey3);
  });
  emit('palette', c);
}
function figRooms() {
  scenes.forEach((s, i) => {
    const frames = [];
    for (let t = 0; t < 120; t += 2) frames.push(game(i, 200 + t, { x: 160, y: 160 }));
    emit(`room-${i}`, frames, { delay: 33, scale: 1 });
  });
}

// ───────────────────────── run ─────────────────────────
const figures = [
  ['tour', figTour], ['anim', figStyleAnims], ['strip', figStrips], ['map', figMaps],
  ['bayer', figBayer], ['pixelate', figPixelate], ['timeline', figTimeline], ['colors', figColors],
  ['pixel-size', figPixelSize], ['compare', figComparisons], ['layers', figLayers],
  ['art-zoom', figZoomArt], ['sprite', figSprite], ['palette', figPalette], ['room', figRooms],
];
for (const [key, fn] of figures) if (want(key)) fn();

const out = document.getElementById('out');
out.textContent = JSON.stringify(OUT);
// Preview in the page (first frame of each figure).
const list = document.getElementById('list');
for (const [name, f] of Object.entries(OUT)) {
  const fig = document.createElement('figure');
  fig.innerHTML = `<figcaption>${name} · ${f.frames.length} frame(s) · ×${f.scale}</figcaption>`;
  const img = new Image(); img.src = f.frames[0]; img.style.width = `${img.width * f.scale}px`;
  img.onload = () => { img.style.width = `${img.naturalWidth * f.scale}px`; };
  fig.appendChild(img); list.appendChild(fig);
}
document.title = 'figures ready';
