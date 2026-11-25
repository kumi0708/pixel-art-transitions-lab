#!/usr/bin/env python3
"""Render tools/figures.html in headless Chrome and write docs/img/*.png|gif.

Usage:
    python3 -m http.server 8000 &          # from the repo root
    python3 tools/export_figures.py [--url http://localhost:8000] [--only tour,anim]

Single-frame figures become PNGs. Multi-frame figures become looping GIFs
(nearest-neighbour upscaled by the figure's `scale`, one local palette per
frame, so no colours are dithered or merged).
"""
import argparse, base64, io, json, os, re, subprocess, sys, tempfile
from PIL import Image

CHROME = os.environ.get('CHROME', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'docs', 'img')


def decode(url):
    return Image.open(io.BytesIO(base64.b64decode(url.split(',', 1)[1]))).convert('RGB')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', default='http://localhost:8000')
    ap.add_argument('--only', default='')
    a = ap.parse_args()
    url = f"{a.url}/tools/figures.html" + (f"?only={a.only}" if a.only else '')

    with tempfile.NamedTemporaryFile(suffix='.html', delete=False) as tmp:
        subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--virtual-time-budget=120000',
                        '--run-all-compositor-stages-before-draw', '--dump-dom', url],
                       stdout=tmp, stderr=subprocess.DEVNULL, check=True, timeout=600)
        dom = open(tmp.name, encoding='utf-8').read()
    m = re.search(r'<script id="out" type="application/json">(.*?)</script>', dom, re.S)
    if not m or not m.group(1).strip():
        sys.exit('figures page produced no output')
    figs = json.loads(m.group(1))
    os.makedirs(OUT_DIR, exist_ok=True)

    for name, spec in figs.items():
        frames = [decode(u) for u in spec['frames']]
        s = spec.get('scale', 1)
        if s != 1:
            frames = [f.resize((f.width * s, f.height * s), Image.NEAREST) for f in frames]
        if len(frames) == 1:
            path = os.path.join(OUT_DIR, f'{name}.png')
            frames[0].save(path, optimize=True)
        else:
            pal = []
            for f in frames:
                n = len(f.getcolors(1 << 24))
                assert n <= 256, f'{name}: frame has {n} colours (>256)'
                pal.append(f.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE))
            path = os.path.join(OUT_DIR, f'{name}.gif')
            pal[0].save(path, save_all=True, append_images=pal[1:], duration=spec['delay'], loop=0, disposal=1)
        print(f'{os.path.relpath(path, ROOT):34s} {len(frames):4d} frame(s) {os.path.getsize(path) / 1024:8.1f} KB')


if __name__ == '__main__':
    main()
