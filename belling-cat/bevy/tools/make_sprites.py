"""Turns ComfyUI line drawings (dark lines on white) into sprite sheets for assets/art/.

The white outside each figure becomes transparent; the inside is tinted paper colour so the
figure reads as a paper cut-out on the dark panels. Every frame of one sheet uses the same
source scale and is anchored by its feet (bottom) and nose (right), so frames do not jitter.

    python tools/make_sprites.py            (run from belling-cat/bevy)

Sources are read from assets/temp/ (ComfyUI downloads, not committed).
"""
import os

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(__file__), "..", "assets")
SRC = os.path.join(ROOT, "temp")
OUT = os.path.join(ROOT, "art")

PAPER = np.array([232, 223, 204], float)  # art.rs PAPER
INK_LEVEL = 170  # darker than this is line
GAP = 4  # line gaps up to ~2*GAP px are closed before deciding inside/outside


def cutout(path, fill=PAPER, single=True):
    """RGBA float array: transparent outside the figure, `fill`-tinted inside. With `single`,
    strokes that float apart from the largest figure (speed lines, dust) are dropped."""
    rgb = np.asarray(Image.open(path).convert("RGB"), float)
    lum = rgb.mean(axis=2)
    ink = lum < INK_LEVEL
    wall = ndimage.binary_dilation(ink, iterations=GAP)
    labels, _ = ndimage.label(~wall)
    edge = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    outside = np.isin(labels, edge[edge > 0])
    # Give back the band the dilation took from the outside, except the lines themselves.
    outside = ndimage.binary_dilation(outside, iterations=GAP + 1) & ~ink
    inside = ~outside

    # Paper grain in the white (lum ~235+) must end up fully transparent.
    darkness = np.clip((230 - lum) / (230 - 40), 0, 1)
    out = np.zeros(rgb.shape[:2] + (4,))
    # Inside: multiply the drawing onto paper. Outside: only the anti-aliased lines remain.
    # Channels are 0..1.
    out[..., :3] = np.where(inside[..., None], rgb * fill / 255, rgb) / 255
    out[..., 3] = np.where(inside, 1.0, darkness)
    parts, n = ndimage.label(ndimage.binary_dilation(out[..., 3] > 0.05, iterations=8))
    if single and n > 1:
        sizes = ndimage.sum(np.ones_like(parts), parts, range(1, n + 1))
        out[parts != 1 + int(np.argmax(sizes))] = 0
    return out


def bbox(a):
    ys, xs = np.nonzero(a[..., 3] > 0.05)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def place(a, cell, scale, foot=0.9, nose=None):
    """Scale `a` and put it in a cell×cell canvas: bottom at `foot`, right edge at `nose`
    (or centred horizontally when None)."""
    x0, y0, x1, y1 = bbox(a)
    img = Image.fromarray((a[y0:y1, x0:x1] * 255).astype(np.uint8), "RGBA")
    w, h = max(1, round((x1 - x0) * scale)), max(1, round((y1 - y0) * scale))
    img = img.resize((w, h), Image.LANCZOS)
    left = round(cell * nose) - w if nose is not None else (cell - w) // 2
    top = round(cell * foot) - h
    if left < 0 or top < 0 or left + w > cell:
        print(f"  warning: frame overflows its {cell}px cell (left {left}, top {top}, width {w})")
    canvas = Image.new("RGBA", (cell, cell))
    canvas.alpha_composite(img, (max(left, 0), max(top, 0)), (max(-left, 0), max(-top, 0)))
    return canvas


def sheet(frames, cols, name):
    cell = frames[0].width
    rows = (len(frames) + cols - 1) // cols
    out = Image.new("RGBA", (cell * cols, cell * rows))
    for i, f in enumerate(frames):
        out.paste(f, ((i % cols) * cell, (i // cols) * cell))
    out.save(os.path.join(OUT, name))
    print(f"{name}: {cols}x{rows} cells of {cell}px")


def hero():
    # Index: 0-1 idle, 2-5 gallop, 6 crouch, 7 airborne. Per-frame scale evens out the
    # mouse size, which the generator did not keep constant between renders.
    poses = [
        ("bc4/idle_1_00001_.png", 1.0),
        ("bc4/idle_2_00001_.png", 1.0),
        ("bc4/run_a1_00001_.png", 0.85),
        ("bc4/run_a2_00001_.png", 1.0),
        ("bc4/run_a3_00001_.png", 1.0),
        ("bc4/run_a4_00001_.png", 1.0),
        ("bc4/jump_1_00001_.png", 1.0),
        ("bc4/jump_3_00001_.png", 1.0),
    ]
    cell = 576
    sheet([place(cutout(os.path.join(SRC, p)), cell, 0.5 * s, nose=0.92) for p, s in poses], 4, "hero.png")


def elder():
    sheet([place(cutout(os.path.join(SRC, "bc4/elder_s21_00001_.png")), 512, 0.5)], 1, "elder.png")


def candle():
    """Candle + holder with the generated flame on its wick; frame 1 is the flame mirrored."""
    base = cutout(os.path.join(SRC, "bc4/candle_base_00001_.png"))
    flames = cutout(os.path.join(SRC, "bc4/candle_flames_00001_.png"), single=False)
    flame = flames[:, : flames.shape[1] // 2]  # the left of the two flames
    fx0, fy0, fx1, fy1 = bbox(flame)
    flame = flame[fy0:fy1, fx0:fx1]
    bx0, by0, bx1, by1 = bbox(base)
    wick_x = np.nonzero(base[by0, :, 3] > 0.05)[0].mean()  # top-most ink is the wick tip

    frames = []
    for mirror in (False, True):
        f = flame[:, ::-1] if mirror else flame
        h, w = f.shape[:2]
        fs = 0.6  # flame size relative to the candle drawing
        fimg = Image.fromarray((f * 255).astype(np.uint8), "RGBA").resize((round(w * fs), round(h * fs)), Image.LANCZOS)
        canvas = Image.fromarray((base * 255).astype(np.uint8), "RGBA")
        # Flame's own wick stroke overlaps the candle wick by a few pixels.
        canvas.alpha_composite(fimg, (round(wick_x - fimg.width / 2), by0 - fimg.height + 12))
        frames.append(np.asarray(canvas, float) / 255)
    # Same crop for both frames so the candle body does not move.
    boxes = [bbox(f) for f in frames]
    x0, y0 = min(b[0] for b in boxes), min(b[1] for b in boxes)
    x1, y1 = max(b[2] for b in boxes), max(b[3] for b in boxes)
    side = max(x1 - x0, y1 - y0)
    cell = 256
    out = []
    for f in frames:
        sq = np.zeros((side, side, 4))
        ox = (side - (x1 - x0)) // 2
        sq[side - (y1 - y0):, ox : ox + x1 - x0] = f[y0:y1, x0:x1]
        out.append(Image.fromarray((sq * 255).astype(np.uint8), "RGBA").resize((cell, cell), Image.LANCZOS))
    sheet(out, 2, "candle.png")


if __name__ == "__main__":
    hero()
    elder()
    candle()
