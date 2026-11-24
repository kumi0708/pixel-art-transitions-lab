# Pixel Art Transitions Lab

[日本語](README.md) | **English**

A browser playground for eight screen (scene) transitions designed for pixel-art games. You can play them and compare them side by side.
It reimplements the techniques from the SpriteCook article [“Pixel Art Screen Transitions”](https://www.spritecook.ai/blog/pixel-art-screen-transitions). The article uses Godot 4 shaders and GDScript; this version uses Canvas 2D and plain JavaScript.

### ▶ Play: https://kumi0708.github.io/pixel-art-transitions-lab/

![All 8 transitions (meadow)](docs/sheet-0.png)
![All 8 transitions (night town)](docs/sheet-1.png)

---

## How to play

| Input | Action |
| --- | --- |
| ← → ↑ ↓ / WASD | Move the hero. Walk off the left/right edge to change rooms |
| Click / tap | Walk to that spot (tap near an edge to change rooms) |
| Space / Enter | Go to the next room |
| 1 – 8 | Switch transition style |
| Auto demo | The hero keeps walking right and tours the rooms |
| Speed | Slow down to 0.1× to study each step |
| Inspect | Pin `progress` with a slider, toggle `reverse`, click to move the iris centre |

The side panel shows `phase / tick / progress / reverse / paused` live, plus the **number of off-palette colours** and the **tick on which the player could first move again**.

There are four rooms: **Meadow → Night Town → Crystal Cave → Sunset Shore**.

## Layout

```
index.html          UI (style picker, controls, timeline)
style.css
src/
  main.js           fixed 60 Hz loop, input, render pipeline, stats, ?sheet mode
  controller.js     shared 84-tick timing state machine
  transitions.js    the eight transitions as per-pixel functions
  scenes.js         four procedurally drawn pixel-art rooms
  art.js            32-colour palette, Bayer matrices, dither/shape helpers, 3×5 font, hero sprite
docs/               images for this README
```

It uses ES modules with no build step and no dependencies. To run it locally, serve the folder over HTTP, because ES modules don't load from `file://`:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/?sheet&scene=1` to render a contact sheet of all 8 styles like the images above. `scene` takes 0–3, and `scale` sets the zoom.

---

## How it works

### 1. Render pipeline

```
[bg canvas] → mid (animated) → [fg canvas] → fx (animated) → [front] → hero → HUD
        ↓ getImageData (320×180 game resolution)
   renderTransition(src, dst, progress, …)   ← the transition is composited here
        ↓ putImageData
   <canvas> scaled up with CSS (image-rendering: pixelated)
```

- **The game renders at a fixed 320×180.** Transitions are computed per game pixel, so the article's `pixel_size` (screen pixels per game pixel) is always 1 here. Upscaling happens last, in CSS. The scale is an **integer** (2×, 3×, …) when possible, and fractional only on screens too small for 2×.
  - A GPU shader that runs at screen resolution must first snap to game pixels with `g = floor(FRAGCOORD.xy / pixel_size)`, as the article says. Otherwise the dither checkers and wipe stairs end up smaller than one game pixel.
- **The HUD (room label) is drawn into the game buffer before the transition**, so the cover goes over the HUD too. This matches the article's "CanvasLayer 100, above the HUD".
- Pixelate reads the screen, so it has to run **after the whole frame is drawn**. The CPU version does this by using the finished `getImageData` frame as its source.

### 2. Shared timing (`src/controller.js`)

One state machine drives the timing for every style. It runs on a fixed 60 ticks/s.

| tick | phase | progress | what happens |
| --- | --- | --- | --- |
| 0 | request | 0 | transition requested, game paused |
| 1–33 | cover | k/33 | screen covered over 0.55 s |
| 34–42 | hold | 1 | **room swapped on tick 34**, hidden under full black |
| 43–75 | uncover | 1 − j/33 | `reverse = true`; tick 43 re-aims the iris at the hero in the new room |
| 76–84 | wait | 0 | cover hidden, still paused; tick 84 unpauses |
| 85 | — | — | **first tick the hero can move** |

Implementation details:

- **Fixed timestep.** Elapsed `requestAnimationFrame` time goes into an accumulator, and `tick()` runs once per 1/60 s. The speed setting multiplies that accumulator, so at 0.25× the number of ticks (the number of visible steps) is unchanged.
- **Re-entry guard.** `request()` returns `false` and does nothing while a transition is running, so standing on the edge can't stack transitions.
- **Pause ordering.** `tick()` decides whether the game is paused from the state **before** the controller steps. So the unpause tick (84) is still a paused tick, and the first movement lands on **tick 85**, the same as Godot's physics order. The panel's "first move tick" shows this.
- **The room only swaps during full black.** Loading while the cover is still closing could make the transition look frozen halfway through.
- Ambient animation (clouds, flames, waves) keeps running. Only player input and movement are paused.

### 3. The eight transitions (`src/transitions.js`)

Each style is a function of a game pixel `(x, y)` and `progress p`. It decides whether to output **the original colour or the cover colour** (the palette black `#0b0a12`). Each one is a fragment-shader formula looped on the CPU over 320×180 = 57,600 pixels, so it ports straight back to a shader.

#### ① Fade
```js
out = round(src × (1 − p) + black × p)
```
Every pixel is blended linearly toward black. This is the only style that creates lots of off-palette colours, and it's here as a baseline. In this demo's meadow, one 33-tick fade-out produced **815** off-palette colours. The article's room had 751.

#### ② Stepped fade
```js
a = floor(p × 4) / 4      // 0 → 25% → 50% → 75% → 100%
```
Alpha is quantised into 4 steps, each held for about 8 frames, which gives a chunky retro fade. Off-palette colours drop to **69**. The article measured 72.

#### ③ Bayer dither
```js
b = floor(g / 2)                               // 2×2 game pixels per block
t = (BAYER8[(b.y % 8) * 8 + (b.x % 8)] + 0.5) / 64
black = p > t
```
The standard 8×8 Bayer matrix (values 0–63) works as a threshold map. A block turns black once progress passes its threshold. Every pixel is either its original colour or black, so it creates **zero new colours**. The `+0.5` puts the thresholds between 0.5/64 and 63.5/64, so p=0 is fully clear and p=1 is fully black. The blocks are 2 px because a 1-px checkerboard shimmers when scaled up.

#### ④ Pixelate
```js
k = floor(p × 6)
if (k >= 5) black
b = 2^k                                         // 1, 2, 4, 8, 16
src = min(floor(g / b) * b + floor(b / 2), size − 1)
```
The block size doubles 1→2→4→8→16, and the last sixth of progress is solid black. **Each block copies its centre pixel.** Averaging would create blended colours and break the palette, so it samples one point per block on purpose.

#### ⑤ Iris
```js
r_max = max distance from the centre to the four corners
black = |(g + 0.5) − c| > (1 − p) × r_max
```
A circle closes on the hero. It closes on the hero in the old room, then **re-aims at the hero in the new room on tick 43**, so the view opens from where the player appears. Using the distance to the farthest corner as `r_max` means p=0 always shows the whole screen, even when the centre is near an edge.

#### ⑥ Diagonal wipe
```js
p' = floor(g / 6) * 6                           // snap to 6×6 stairs
w = (p'.x + p'.y + 6) / (W + H)                 // ≈0 top-left → ≈1 bottom-right
black = reverse ? (w > 1 − p) : (w < p)
```
Black sweeps from the top left to the bottom right with a 6-px staircase edge. Playing the same formula backwards on the uncover phase would make the black "bounce" back the way it came. So the **`reverse` flag flips the test**, and the black leaves through the bottom right.

#### ⑦ Diamonds
```js
cell  = floor((g + 0.5) / 12)
f     = ((g + 0.5) − cell × 12) / 12 − 0.5       // local coords −0.5..0.5
delay = (cell.x + cell.y) / max(cells.x + cells.y − 2, 1)
black = |f.x| + |f.y| < 2p − delay
```
In each 12-px tile, a Manhattan-distance diamond grows. A per-tile `delay` makes the effect travel from the top left to the bottom right. At p=1 the bottom-right tile reaches a threshold of `2 − 1 = 1`, so it fills too.

#### ⑧ Shutters
```js
black = (y mod 8) < p × 8
```
Every 8-px band fills from its top row down, one row at a time, like blinds closing. Bigger bands mean fewer, heavier slats.

### 4. Checking that no new colours appear

Every pixel of the game frame is drawn from the 32-colour palette (see "How the art is made" below). Each frame, the demo counts the **colours in the output that aren't in the palette** with a `Set`.

| Style | Off-palette colours |
| --- | --- |
| Fade (33-tick fade-out) | 815 |
| Stepped fade (same) | 69 |
| Dither / Pixelate / Iris / Wipe / Diamonds / Shutters | **0** (checked at p = 0, 0.3, 0.5, 0.8, 1) |

These were also checked in the browser: p=0 looks identical to no transition, the room swaps on tick 34, a second request while running returns `false`, and the first move is on tick 85. The tick-85 check covered requests from the button and from walking off the edge.

### 5. How the art is made (`src/art.js`, `src/scenes.js`)

There are no image files. Everything is drawn in code.

- **Fixed 32-colour palette** (`PAL`). Everything is drawn with integer-aligned `fillRect` and no anti-aliasing, so the buffer holds only palette colours. That's what makes the check above meaningful.
- **Dithered gradients.** Skies and the sea mix neighbouring palette colours with a 4×4 Bayer matrix, which gives smooth tones without adding colours (`gradient()`). Runs of the same colour are merged into one `fillRect` for speed (`ditherRow()`).
- **Dithered glows.** Street lamps, torches, crystals and the sun use `glow()`. It places palette-colour dots with a density that falls off with distance from the centre. Changing the radius a little each tick makes flames flicker.
- **Layers.** The static `bg` / `fg` / `front` layers are drawn once into off-screen canvases and cached. Only moving things are redrawn each frame: clouds, stars, smoke, waves, the crab and so on.
- **Seeded RNG** (mulberry32) places trees, stars and stones, so the scenes look the same on every load.
- The **3×5 pixel font** and the **12×16 hero sprite** are also hand-made. The sprite is a string map with 2 walk frames plus idle, and it flips horizontally.

### 6. Porting notes

- For Godot or Unity shaders, each `case` in `transitions.js` becomes a fragment-shader body. Convert coordinates to game pixels with `floor(FRAGCOORD.xy / pixel_size)` first.
- Unity's `SV_POSITION` starts at the bottom left on some platforms. If the wipe or shutters run upward, flip y.
- Pixelate needs a copy of the screen (Godot `hint_screen_texture`, Unity GrabPass or RenderTexture) with nearest sampling.
- If you change the 60 Hz tick rate, scale the 33/9/33/9 tick counts too, or the durations will change.

## Credits

- The techniques, timing and formulas come from the SpriteCook article [“Pixel Art Screen Transitions”](https://www.spritecook.ai/blog/pixel-art-screen-transitions). The code here was written new for this repository.
- All art is generated by the code in this repository.
