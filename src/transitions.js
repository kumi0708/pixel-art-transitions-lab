// Eight pixel-art screen transitions, evaluated per game pixel on the CPU.
// Every function is a direct port of a fragment-shader formula: given a
// game pixel (x, y) and progress p in [0, 1], decide the output color.
// Apart from `fade` and `stepped`, every output pixel is either the
// original art color or the cover color — no new colors are ever created.

import { BAYER8 } from './art.js';

export const STYLES = [
  {
    id: 'fade', ja: 'フェード', en: 'Fade',
    desc: 'alpha = p。全ピクセルを黒へ線形補間。パレット外の中間色が大量に生まれる（比較用）。',
  },
  {
    id: 'stepped', ja: '段階フェード', en: 'Stepped fade',
    desc: 'alpha = floor(p × 4) / 4。25%刻みの4段階。中間色は数十色まで減る。',
  },
  {
    id: 'dither', ja: 'ベイヤーディザ', en: 'Bayer dither',
    desc: '2×2ブロック単位で 8×8 ベイヤー行列のしきい値 (B+0.5)/64 と p を比較。黒か原色のみ。',
  },
  {
    id: 'pixelate', ja: 'ピクセレート', en: 'Pixelate',
    desc: 'k = floor(p × 6)。ブロック 1→2→4→8→16px、k≥5 で黒。各ブロックは中央の1ピクセルをコピー（平均しない）。',
  },
  {
    id: 'iris', ja: 'アイリス', en: 'Iris',
    desc: 'プレイヤー中心の円。|p − c| > (1 − p)·r_max で黒。開くときは新しい部屋のプレイヤーへ再照準。',
  },
  {
    id: 'wipe', ja: '斜めワイプ', en: 'Diagonal wipe',
    desc: '6px の階段にスナップし w = (x+y+6)/(W+H) を p と比較。戻りは reverse で同じ方向へ抜ける。',
  },
  {
    id: 'diamonds', ja: 'ダイヤ', en: 'Diamonds',
    desc: '12px タイルごとにマンハッタン距離 |fx|+|fy| < 2p − delay。delay は左上0→右下1。',
  },
  {
    id: 'shutters', ja: 'シャッター', en: 'Shutters',
    desc: '8px の帯ごとに (y mod 8) < p × 8 で黒。ブラインドが上から1行ずつ閉じる。',
  },
];

export const PARAMS = {
  steps: 4,      // stepped fade
  block: 2,      // dither block size (game px)
  wipeStep: 6,   // diagonal wipe stair size
  tile: 12,      // diamond tile size
  bar: 8,        // shutter band height
};

/**
 * @param {Uint8ClampedArray} src  RGBA game frame (W×H)
 * @param {Uint8ClampedArray} dst  RGBA output
 * @param {number} W
 * @param {number} H
 * @param {string} style
 * @param {number} p        progress 0..1
 * @param {{reverse:boolean, center:{x:number,y:number}, cover:number[]}} opt
 */
export function renderTransition(src, dst, W, H, style, p, opt) {
  const [cr, cg, cb] = opt.cover;
  if (p <= 0) { dst.set(src); return; }

  // Helper: write cover color (or original) at byte index i.
  const black = (i) => { dst[i] = cr; dst[i + 1] = cg; dst[i + 2] = cb; dst[i + 3] = 255; };
  const keep = (i) => { dst[i] = src[i]; dst[i + 1] = src[i + 1]; dst[i + 2] = src[i + 2]; dst[i + 3] = 255; };

  switch (style) {
    case 'fade':
    case 'stepped': {
      const a = style === 'fade' ? p : Math.floor(p * PARAMS.steps) / PARAMS.steps;
      const ia = 1 - a;
      for (let i = 0; i < src.length; i += 4) {
        dst[i] = Math.round(src[i] * ia + cr * a);
        dst[i + 1] = Math.round(src[i + 1] * ia + cg * a);
        dst[i + 2] = Math.round(src[i + 2] * ia + cb * a);
        dst[i + 3] = 255;
      }
      return;
    }

    case 'dither': {
      const b = PARAMS.block;
      for (let y = 0; y < H; y++) {
        const by = Math.floor(y / b) & 7;
        for (let x = 0; x < W; x++) {
          const bx = Math.floor(x / b) & 7;
          const t = (BAYER8[by * 8 + bx] + 0.5) / 64;
          const i = (y * W + x) * 4;
          p > t ? black(i) : keep(i);
        }
      }
      return;
    }

    case 'pixelate': {
      const k = Math.floor(p * 6);
      if (k >= 5) { for (let i = 0; i < dst.length; i += 4) black(i); return; }
      const b = 1 << k; // 1, 2, 4, 8, 16
      const half = b >> 1;
      for (let y = 0; y < H; y++) {
        const sy = Math.min(Math.floor(y / b) * b + half, H - 1);
        for (let x = 0; x < W; x++) {
          const sx = Math.min(Math.floor(x / b) * b + half, W - 1);
          const i = (y * W + x) * 4, j = (sy * W + sx) * 4;
          dst[i] = src[j]; dst[i + 1] = src[j + 1]; dst[i + 2] = src[j + 2]; dst[i + 3] = 255;
        }
      }
      return;
    }

    case 'iris': {
      const cx = opt.center.x, cy = opt.center.y;
      // r_max = distance to the farthest screen corner
      const rMax = Math.max(
        Math.hypot(cx, cy), Math.hypot(W - cx, cy),
        Math.hypot(cx, H - cy), Math.hypot(W - cx, H - cy),
      );
      const r = (1 - p) * rMax, r2 = r * r;
      for (let y = 0; y < H; y++) {
        const dy = y + 0.5 - cy;
        for (let x = 0; x < W; x++) {
          const dx = x + 0.5 - cx;
          const i = (y * W + x) * 4;
          dx * dx + dy * dy > r2 ? black(i) : keep(i);
        }
      }
      return;
    }

    case 'wipe': {
      const s = PARAMS.wipeStep;
      for (let y = 0; y < H; y++) {
        const py = Math.floor(y / s) * s;
        for (let x = 0; x < W; x++) {
          const px = Math.floor(x / s) * s;
          const w = (px + py + s) / (W + H);
          const covered = opt.reverse ? w > 1 - p : w < p;
          const i = (y * W + x) * 4;
          covered ? black(i) : keep(i);
        }
      }
      return;
    }

    case 'diamonds': {
      const T = PARAMS.tile;
      const cellsX = Math.ceil(W / T), cellsY = Math.ceil(H / T);
      const denom = Math.max(cellsX + cellsY - 2, 1);
      for (let y = 0; y < H; y++) {
        const py = y + 0.5, cyi = Math.floor(py / T);
        const fy = (py - cyi * T) / T - 0.5;
        for (let x = 0; x < W; x++) {
          const px = x + 0.5, cxi = Math.floor(px / T);
          const fx = (px - cxi * T) / T - 0.5;
          const delay = (cxi + cyi) / denom;
          const i = (y * W + x) * 4;
          Math.abs(fx) + Math.abs(fy) < p * 2 - delay ? black(i) : keep(i);
        }
      }
      return;
    }

    case 'shutters': {
      const bar = PARAMS.bar;
      for (let y = 0; y < H; y++) {
        const covered = (y % bar) < p * bar;
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          covered ? black(i) : keep(i);
        }
      }
      return;
    }

    default:
      dst.set(src);
  }
}
