"""Extract neutral indentation lighting from the approved v3 glass render.

The blue material stays in octi-glass-33-184.png. These masks contain only
the change in reflected light, localized around the fingertip indentation.
Run with Python, Pillow and numpy; no Blender rerender is needed.
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SIZE, POSES = 384, 6


def smooth(value):
    value = np.clip(value, 0, 1)
    return value**3 * (10 + value * (-15 + 6 * value))


def membrane(atlas, index):
    x, y = index % 6 * SIZE, index // 6 * SIZE
    tile = atlas.crop((x, y, x + SIZE, y + SIZE))
    alpha = np.asarray(tile)[:, :, 3]
    ys, xs = np.where(alpha > 3)
    # Remove the source render's expansion: native CSS already owns it.
    tile = tile.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    tile = tile.resize((346, 346), Image.Resampling.LANCZOS)
    frame = Image.new('RGBA', (SIZE, SIZE))
    frame.paste(tile, (19, 19))
    return np.asarray(frame, dtype=np.float32) / 255


def fields(frame):
    alpha = frame[:, :, 3]
    white = alpha * smooth((frame[:, :, :3].min(axis=2) - .66) / .34)
    shade = alpha * (1 - frame[:, :, :3] @ np.array([.2126, .7152, .0722]))
    return white, shade


def main():
    atlas = Image.open(ROOT / 'octi-pressure-33-311.webp').convert('RGBA')
    rest_white, rest_shade = fields(membrane(atlas, 8))
    y, x = np.mgrid[:SIZE, :SIZE]
    radius = np.hypot(x - (SIZE - 1) / 2, y - (SIZE - 1) / 2) / SIZE
    # Keep the central fingertip and the existing blue outer rim clear.
    annulus = smooth((radius - .075) / .055) * (1 - smooth((radius - .29) / .075))
    output = Image.new('RGBA', (SIZE * POSES, SIZE))
    for pose in range(1, POSES + 1):
        position = pose / POSES * 20
        lo, hi = int(np.floor(position)), int(np.ceil(position))
        low, high = membrane(atlas, 8 + lo), membrane(atlas, 8 + hi)
        weight = position - lo
        # Premultiplied interpolation avoids dark fringes in transparent glass.
        alpha = low[:, :, 3] * (1 - weight) + high[:, :, 3] * weight
        rgb = low[:, :, :3] * low[:, :, 3:] * (1 - weight) + high[:, :, :3] * high[:, :, 3:] * weight
        rgb = np.divide(rgb, alpha[:, :, None], out=np.zeros_like(rgb), where=alpha[:, :, None] > 0)
        white, shade = fields(np.dstack((rgb, alpha)))
        light = np.maximum(white - rest_white, 0) * 2.8 + np.maximum(rest_shade - shade, 0) * 1.5
        dark = np.maximum(shade - rest_shade, 0) * 1.8 + np.maximum(rest_white - white, 0) * .28
        delta = (light - dark) * annulus
        # Blur signed light before splitting it, preserving neutral RGB exactly.
        signed = Image.fromarray(np.asarray(np.clip(delta * 127 + 128, 0, 255), dtype=np.uint8))
        delta = (np.asarray(signed.filter(ImageFilter.GaussianBlur(.65)), dtype=np.float32) - 128) / 127
        alpha = np.minimum(np.abs(delta), .76) * annulus
        rgba = np.zeros((SIZE, SIZE, 4), dtype=np.uint8)
        rgba[:, :, :3] = np.where(delta[:, :, None] > 0, 255, 0)
        rgba[:, :, 3] = np.rint(alpha * 255).astype(np.uint8)
        output.paste(Image.fromarray(rgba), ((pose - 1) * SIZE, 0))
    target = ROOT / 'octi-pressure-lights-33-319.webp'
    output.save(target, format='WEBP', lossless=True, method=6, exact=True)
    print(f'{target.name}: {output.width}x{output.height}, {target.stat().st_size} bytes, neutral light only')


if __name__ == '__main__':
    main()
