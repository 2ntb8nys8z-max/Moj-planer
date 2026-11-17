"""Pack Blender membrane frames. Usage: python scripts/pack-okti-pressure.py DIR."""
from pathlib import Path
import sys
from PIL import Image

frames = Path(sys.argv[1])
atlas = Image.new('RGBA', (384 * 6, 384 * 5))
for index in range(29):
    image = Image.open(frames / f'frame_{index:03d}.png').convert('RGBA')
    atlas.paste(image.crop((64, 64, 448, 448)), ((index % 6) * 384, (index // 6) * 384))
target = Path('octi-pressure-33-311.webp')
atlas.save(target, 'WEBP', quality=92, alpha_quality=100, method=6)
print(f'{target}: {target.stat().st_size} bytes, 29 membrane states, 2304×1920')
