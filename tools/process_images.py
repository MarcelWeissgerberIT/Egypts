"""Turn the raw Higgsfield generations in art/src into web-ready game assets in public/assets."""
from PIL import Image, ImageFilter
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art', 'src')
OUT = os.path.join(ROOT, 'public', 'assets')
os.makedirs(os.path.join(OUT, 'ui'), exist_ok=True)
os.makedirs(os.path.join(OUT, 'tex'), exist_ok=True)

def trim(im, pad=4):
    a = im.split()[-1].point(lambda v: 255 if v > 8 else 0)
    box = a.getbbox()
    if not box:
        return im
    l, t, r, b = box
    l = max(0, l - pad); t = max(0, t - pad); r = min(im.width, r + pad); b = min(im.height, b + pad)
    return im.crop((l, t, r, b))

def fit(im, max_w, max_h):
    r = min(max_w / im.width, max_h / im.height, 1.0)
    if r < 1.0:
        im = im.resize((max(1, round(im.width * r)), max(1, round(im.height * r))), Image.LANCZOS)
    return im

def ui(name, src, max_w, max_h, do_trim=True):
    im = Image.open(os.path.join(SRC, 'ui', src)).convert('RGBA')
    if do_trim:
        im = trim(im)
    im = fit(im, max_w, max_h)
    im.save(os.path.join(OUT, 'ui', name + '.webp'), 'WEBP', quality=88, method=6)
    return im.size

sizes = {}
for b in ['btn_play', 'btn_pause', 'btn_restart', 'btn_next', 'btn_home', 'btn_sound_on', 'btn_sound_off', 'btn_shuffle']:
    sizes[b] = ui(b, b + '.png', 256, 256)
for i in ['icon_scarab', 'icon_sun', 'icon_ankh', 'icon_eye', 'icon_eye_empty', 'icon_lock', 'icon_pyramid', 'icon_rotate', 'hand', 'sparkle']:
    sizes[i] = ui(i, i + '.png', 192, 192)
for d in [str(n) for n in range(10)] + ['plus', 'x']:
    sizes['d' + d] = ui('d' + d if d.isdigit() else 'd_' + d, ('d' + d if d.isdigit() else 'd_' + d) + '.png', 160, 160)
sizes['logo'] = ui('logo', 'logo.png', 900, 900)
sizes['panel'] = ui('panel', 'panel.png', 640, 860)
sizes['banner_win'] = ui('banner_win', 'banner_win.png', 760, 600)
sizes['banner_lose'] = ui('banner_lose', 'banner_lose.png', 760, 600)
sizes['medallion'] = ui('medallion', 'medallion.png', 256, 256)
sizes['plaque'] = ui('plaque', 'plaque.png', 520, 240)

def tex(name, src, size, fmt='JPEG', q=84, alpha=False):
    im = Image.open(os.path.join(SRC, 'tex', src))
    im = im.convert('RGBA' if alpha else 'RGB')
    if isinstance(size, tuple):
        im = im.resize(size, Image.LANCZOS)
    else:
        im = fit(im, size, size)
    ext = 'webp' if fmt == 'WEBP' else 'jpg'
    if fmt == 'WEBP':
        im.save(os.path.join(OUT, 'tex', name + '.' + ext), 'WEBP', quality=q, method=6)
    else:
        im.save(os.path.join(OUT, 'tex', name + '.' + ext), 'JPEG', quality=q, optimize=True, progressive=True)

tex('sand', 'sand.png', (512, 512))
tex('limestone', 'limestone.png', (512, 512))
tex('gold', 'gold.png', (512, 512))
tex('strata', 'strata.png', (512, 512))
tex('water', 'water.png', (512, 512))
tex('bedrock', 'bedrock.png', (512, 512))
tex('sky', 'sky.png', (1080, 1920), q=80)
tex('title', 'title.png', (1080, 1920), q=82)
tex('cloud', 'cloud.png', 640, fmt='WEBP', alpha=True)
tex('dust', 'dust.png', 256, fmt='WEBP', alpha=True)
tex('glyph', 'glyph.png', 256, fmt='WEBP', alpha=True)

# app icons (opaque)
ic = Image.open(os.path.join(SRC, 'tex', 'appicon.png')).convert('RGB')
ic.resize((180, 180), Image.LANCZOS).save(os.path.join(OUT, 'apple-touch-icon.png'), optimize=True)
ic.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'icon-512.png'), optimize=True)
ic.resize((64, 64), Image.LANCZOS).save(os.path.join(OUT, 'favicon.png'), optimize=True)

import json
json.dump({k: list(v) for k, v in sizes.items()}, open(os.path.join(OUT, 'ui', 'sizes.json'), 'w'), indent=0)
print(json.dumps(sizes))
