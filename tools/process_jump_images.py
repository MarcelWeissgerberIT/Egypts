"""Web-ready images for the platformer (jump/assets) from the raw Higgsfield art in art/src/jump."""
from PIL import Image
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art', 'src', 'jump')
OUT = os.path.join(ROOT, 'jump', 'assets')
for d in ('bg', 'tab', 'tex', 'ui'):
    os.makedirs(os.path.join(OUT, d), exist_ok=True)

def trim(im, pad=4):
    a = im.split()[-1].point(lambda v: 255 if v > 8 else 0)
    box = a.getbbox()
    if not box: return im
    l, t, r, b = box
    return im.crop((max(0, l - pad), max(0, t - pad), min(im.width, r + pad), min(im.height, b + pad)))

def jpg(src, dst, size, q=82):
    im = Image.open(os.path.join(SRC, src)).convert('RGB')
    im = im.resize(size, Image.LANCZOS)
    im.save(os.path.join(OUT, dst), 'JPEG', quality=q, optimize=True, progressive=True)

for i in range(1, 11):
    jpg(f'bg{i}.png', f'bg/w{i}.jpg', (1600, 900), 80)
    jpg(f'tab{i}.png', f'tab/s{i}.jpg', (768, 768), 84)
jpg('tex_sandstone.png', 'tex/sandstone.jpg', (1024, 1024), 84)
jpg('tex_hiero.png', 'tex/hiero.jpg', (1024, 1024), 84)
jpg('tex_granite.png', 'tex/granite.jpg', (1024, 1024), 84)
jpg('map.png', 'ui/map.jpg', (900, 1600), 82)
jpg('title.png', 'ui/title.jpg', (900, 1600), 82)
for n, size in [('btn_jump', 220), ('btn_act', 200), ('stick_base', 260), ('stick_knob', 150), ('papyrus', 180), ('logo', 900)]:
    im = trim(Image.open(os.path.join(SRC, n + '.png')).convert('RGBA'))
    r = min(size / im.width, size / im.height, 1)
    im = im.resize((max(1, round(im.width * r)), max(1, round(im.height * r))), Image.LANCZOS)
    im.save(os.path.join(OUT, 'ui', n + '.webp'), 'WEBP', quality=88, method=6)
print('jump images ok')
