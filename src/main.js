import { W, H, PAL, PALETTE, COVER, hexToRgb, makeCanvas, R, ellipse, drawText, textWidth, drawHero } from './art.js';
import { buildScenes } from './scenes.js';
import { STYLES, renderTransition } from './transitions.js';
import { TransitionController, TIMING, TOTAL } from './controller.js';

const TICK = 1 / 60;
const screen = document.getElementById('screen');
const sctx = screen.getContext('2d');
screen.width = W; screen.height = H;
const [, gx] = makeCanvas();
const out = sctx.createImageData(W, H);
const cover = hexToRgb(COVER);
const paletteSet = new Set(PALETTE.map((h) => { const [r, g, b] = hexToRgb(h); return (r << 16) | (g << 8) | b; }));

const scenes = buildScenes();
const ctrl = new TransitionController();

const state = {
  scene: 0,
  style: 'dither',
  frame: 0,          // ambient animation clock (never pauses)
  speed: 1,
  auto: false,
  cycle: false,
  manual: false,
  manualP: 0.5,
  manualRev: false,
  center: { x: W / 2, y: H / 2 },
  banner: 0,
  newColors: new Set(),
  frameForeign: 0,
  moveTick: null,     // tick (relative to the request) of the first move after a transition
  reqTick: null,
  doneTick: null,
};

const hero = { x: 150, y: 160, flip: false, walk: 0, moving: false, target: null };
const keys = new Set();

// ───────────────────────── game logic ─────────────────────────
function heroCenter() { return { x: hero.x, y: hero.y - 8 }; }

function changeRoom(dir) {
  const ok = ctrl.request({
    onLoad: () => {                                   // tick 34, screen is black
      state.scene = (state.scene + dir + scenes.length) % scenes.length;
      hero.x = dir > 0 ? 14 : W - 14;
      hero.flip = dir < 0;
      hero.target = state.auto ? { x: W + 10, y: 150 + Math.random() * 18 } : null;
      state.banner = 0;
    },
    onReaim: () => { state.center = heroCenter(); },  // tick 43
    onDone: () => { state.doneTick = ctrlClock; },
  });
  if (ok) {
    state.reqTick = ctrlClock;                        // this is "tick 0"
    state.center = heroCenter();
    state.newColors.clear();
    state.moveTick = null;
    if (state.cycle) {
      const i = STYLES.findIndex((s) => s.id === state.style);
      setStyle(STYLES[(i + 1) % STYLES.length].id);
    }
  }
  return ok;
}

let ctrlClock = 0;
function tick() {
  ctrlClock++;
  state.frame++;
  state.banner++;
  // The pause flag is sampled *before* the controller steps, like Godot's
  // physics order: the tick that unpauses (84) is still a paused tick, so
  // the player's first movement lands on tick 85.
  const paused = ctrl.active;
  ctrl.tick();
  if (paused) { hero.moving = false; return; }

  let dx = 0, dy = 0;
  if (keys.has('ArrowLeft') || keys.has('a')) dx -= 1;
  if (keys.has('ArrowRight') || keys.has('d')) dx += 1;
  if (keys.has('ArrowUp') || keys.has('w')) dy -= 1;
  if (keys.has('ArrowDown') || keys.has('s')) dy += 1;
  if (dx || dy) hero.target = null;
  else if (hero.target) {
    const tx = hero.target.x - hero.x, ty = hero.target.y - hero.y;
    const d = Math.hypot(tx, ty);
    if (d < 1.5) hero.target = null; else { dx = tx / d; dy = ty / d; }
  }
  if (!dx && !dy && state.auto && !hero.target) hero.target = { x: W + 10, y: 150 + Math.random() * 18 };

  hero.moving = !!(dx || dy);
  if (hero.moving) {
    if (state.moveTick === null && state.reqTick != null) state.moveTick = ctrlClock - state.reqTick;
    const n = Math.hypot(dx, dy);
    hero.x += (dx / n) * 1.2; hero.y += (dy / n) * 0.8;
    hero.y = Math.max(148, Math.min(174, hero.y));
    if (dx) hero.flip = dx < 0;
    hero.walk++;
  } else hero.walk = 0;

  if (hero.x > W - 4) changeRoom(+1);
  else if (hero.x < 4) changeRoom(-1);
}

// ───────────────────────── rendering ─────────────────────────
function drawScene() {
  const s = scenes[state.scene];
  gx.drawImage(s.bg, 0, 0);
  s.mid?.(gx, state.frame);
  gx.drawImage(s.fg, 0, 0);
  s.fx?.(gx, state.frame);
  if (s.front) gx.drawImage(s.front, 0, 0);

  ellipse(gx, s.shadow, hero.x, hero.y, 5, 1.5);
  const pose = hero.moving ? ((hero.walk >> 3) % 2 ? 'b' : 'a') : 'idle';
  drawHero(gx, hero.x, hero.y, pose, hero.flip);

  // HUD (drawn into the game buffer, so the cover hides it too)
  const label = `${state.scene + 1}/${scenes.length} ${s.name}`;
  const w = textWidth(label) + 8;
  R(gx, PAL.ink, 4, 4, w, 11); R(gx, PAL.deep, 5, 5, w - 2, 9);
  R(gx, PAL.yellow, 5, 5, 2, 1); R(gx, PAL.yellow, 5, 5, 1, 2);
  drawText(gx, label, 8, 7, PAL.cream, PAL.ink);
  if (!ctrl.active && (state.frame >> 5) % 2) {
    drawText(gx, '>', W - 8, 158, PAL.cream, PAL.ink);
    drawText(gx, '<', 5, 158, PAL.cream, PAL.ink);
  }
}

function present() {
  const src = gx.getImageData(0, 0, W, H).data;
  let p = ctrl.progress, rev = ctrl.reverse;
  if (state.manual) { p = state.manualP; rev = state.manualRev; }
  renderTransition(src, out.data, W, H, state.style, p, { reverse: rev, center: state.center, cover });
  sctx.putImageData(out, 0, 0);

  // Count colours that are not in the 32-colour palette.
  if (ctrl.active || state.manual) {
    const d = out.data, seen = new Set();
    for (let i = 0; i < d.length; i += 4) {
      const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      if (!paletteSet.has(k)) { seen.add(k); state.newColors.add(k); }
    }
    state.frameForeign = seen.size;
  } else state.frameForeign = 0;
}

// ───────────────────────── UI ─────────────────────────
const $ = (id) => document.getElementById(id);
const styleWrap = $('styles');
STYLES.forEach((s, i) => {
  const b = document.createElement('button');
  b.className = 'style-btn';
  b.dataset.id = s.id;
  b.innerHTML = `<span class="key">${i + 1}</span><span class="ja">${s.ja}</span><span class="en">${s.en}</span>`;
  b.onclick = () => setStyle(s.id);
  styleWrap.appendChild(b);
});
function setStyle(id) {
  state.style = id;
  const s = STYLES.find((x) => x.id === id);
  for (const b of styleWrap.children) b.classList.toggle('on', b.dataset.id === id);
  $('style-name').textContent = `${s.ja} / ${s.en}`;
  $('style-desc').textContent = s.desc;
  state.newColors.clear();
}
setStyle(state.style);

$('next').onclick = () => changeRoom(+1);
$('prev').onclick = () => changeRoom(-1);
$('auto').onchange = (e) => { state.auto = e.target.checked; if (!state.auto) hero.target = null; };
$('cycle').onchange = (e) => { state.cycle = e.target.checked; };
$('speed').onchange = (e) => { state.speed = +e.target.value; };
$('manual').onchange = (e) => {
  state.manual = e.target.checked;
  document.body.classList.toggle('manual', state.manual);
  state.newColors.clear();
  if (state.manual) state.center = heroCenter();
};
$('progress').oninput = (e) => { state.manualP = +e.target.value; $('progress-val').textContent = state.manualP.toFixed(3); };
$('reverse').onchange = (e) => { state.manualRev = e.target.checked; };

addEventListener('keydown', (e) => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k >= '1' && k <= '8') { setStyle(STYLES[+k - 1].id); return; }
  if (k === ' ' || k === 'Enter') { if (e.target.tagName !== 'BUTTON') { changeRoom(+1); e.preventDefault(); } return; }
  if (k.startsWith('Arrow')) e.preventDefault();
  keys.add(k);
});
addEventListener('keyup', (e) => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
addEventListener('blur', () => keys.clear());

screen.addEventListener('pointerdown', (e) => {
  const r = screen.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
  hero.target = { x: x > W - 12 ? W + 10 : x < 12 ? -10 : x, y: Math.max(148, Math.min(174, y)) };
  if (state.manual) state.center = { x, y };
});

// Integer scaling where possible; fractional only below 2× on small screens.
function fit() {
  const avail = $('stage').clientWidth;
  const s = avail >= W * 2 ? Math.floor(avail / W) : avail / W;
  screen.style.width = `${Math.floor(W * s)}px`;
  screen.style.height = `${Math.floor(H * s)}px`;
  $('scale').textContent = Number.isInteger(s) ? `${s}×` : `${s.toFixed(2)}× (fractional)`;
}
addEventListener('resize', fit);
fit();

// Timeline segments
const tl = $('timeline');
for (const [name, n] of [['cover', TIMING.out], ['hold', TIMING.hold], ['uncover', TIMING.in], ['wait', TIMING.wait]]) {
  const seg = document.createElement('div');
  seg.className = `seg ${name}`;
  seg.style.flex = n;
  seg.textContent = `${name} ${n}`;
  tl.appendChild(seg);
}
const marker = document.createElement('div');
marker.className = 'marker';
tl.appendChild(marker);

function updateStats() {
  $('st-phase').textContent = state.manual ? 'manual' : ctrl.phase;
  $('st-tick').textContent = ctrl.active ? `${ctrl.t} / ${TOTAL}` : '—';
  $('st-progress').textContent = (state.manual ? state.manualP : ctrl.progress).toFixed(3);
  $('st-reverse').textContent = String(state.manual ? state.manualRev : ctrl.reverse);
  $('st-paused').textContent = ctrl.active ? 'yes' : 'no';
  $('st-new').textContent = state.newColors.size;
  $('st-frame').textContent = state.frameForeign;
  $('st-move').textContent = state.moveTick === null ? '—' : `tick ${state.moveTick}`;
  marker.style.left = `${(Math.max(ctrl.t, 0) / TOTAL) * 100}%`;
  marker.style.opacity = ctrl.active ? 1 : 0.25;
}

// ───────────────────────── contact sheet (?sheet) ─────────────────────────
// Renders every style mid-transition into one image (used for the README).
function renderSheet() {
  const q = new URLSearchParams(location.search);
  const scale = +(q.get('scale') || 2), cols = 4, pad = 4, lab = 12;
  const sceneIdx = +(q.get('scene') || 0);
  const [sheet, sg] = makeCanvas(cols * (W + pad) + pad, 2 * (H + lab + pad) + pad);
  R(sg, PAL.ink, 0, 0, sheet.width, sheet.height);
  state.scene = sceneIdx; state.manual = true;
  hero.x = 168; hero.y = 160; state.center = heroCenter();
  for (let i = 0; i < 90; i++) tick();
  const ps = { fade: 0.5, stepped: 0.5, dither: 0.5, pixelate: 0.6, iris: 0.5, wipe: 0.45, diamonds: 0.55, shutters: 0.5 };
  STYLES.forEach((st, i) => {
    state.style = st.id; state.manualP = ps[st.id];
    drawScene(); present();
    const x = pad + (i % cols) * (W + pad), y = pad + Math.floor(i / cols) * (H + lab + pad);
    drawText(sg, `${i + 1}. ${st.en}  - P ${ps[st.id]}`, x + 1, y + 3, PAL.yellow, PAL.black);
    sg.drawImage(screen, x, y + lab);
  });
  document.body.innerHTML = '';
  document.body.style.cssText = 'margin:0;background:#1a1528';
  sheet.style.cssText = `display:block;width:${sheet.width * scale}px;image-rendering:pixelated`;
  document.body.appendChild(sheet);
}

// ───────────────────────── main loop (fixed 60 Hz) ─────────────────────────
let last = performance.now(), acc = 0;
function loop(now) {
  acc += Math.min(0.25, (now - last) / 1000) * state.speed;
  last = now;
  let steps = 0;
  while (acc >= TICK && steps < 8) { tick(); acc -= TICK; steps++; }
  drawScene();
  present();
  updateStats();
  requestAnimationFrame(loop);
}
if (new URLSearchParams(location.search).has('sheet')) renderSheet();
else requestAnimationFrame(loop);

// Handy for poking at things from the devtools console.
window.lab = {
  state, ctrl, hero, scenes, changeRoom, setStyle, keys,
  step(n = 1) { for (let i = 0; i < n; i++) { tick(); drawScene(); present(); } updateStats(); },
};
