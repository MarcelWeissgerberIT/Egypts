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

# ---------------- production game additions ----------------
for n in ['r_deben', 'r_worker', 'r_grain', 'r_bread', 'r_stone', 'r_block', 'r_tools', 'r_ore', 'plot', 'bubble']:
    sizes[n] = ui(n, n + '.png', 160, 160)
for n in ['btn_up', 'btn_close']:
    sizes[n] = ui(n, n + '.png', 200, 200)

# building cards: the Meshy reference renders with their white background keyed out
from collections import deque
def key_white(im, tol=26):
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        q.append((x, 0)); q.append((x, h - 1))
    for y in range(h):
        q.append((0, y)); q.append((w - 1, y))
    def whiteish(c):
        return c[0] > 255 - tol and c[1] > 255 - tol and c[2] > 255 - tol
    while q:
        x, y = q.popleft()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        c = px[x, y]
        if not whiteish(c):
            continue
        px[x, y] = (c[0], c[1], c[2], 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]:
                q.append((nx, ny))
    # soften the cut edge
    a = im.split()[-1].filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    im.putalpha(a)
    return im

for n in ['house', 'farm', 'bakery', 'quarry', 'mason', 'mine', 'smithy']:
    im = key_white(Image.open(os.path.join(SRC, 'buildings', n + '.png')))
    im = trim(im)
    im = fit(im, 240, 240)
    im.save(os.path.join(OUT, 'ui', 'b_' + n + '.webp'), 'WEBP', quality=88, method=6)
    sizes['b_' + n] = im.size
json.dump({k: list(v) for k, v in sizes.items()}, open(os.path.join(OUT, 'ui', 'sizes.json'), 'w'), indent=0)
print('production assets ok')

# ---------------- route game additions ----------------
for n in ['btn_route', 'btn_add']:
    sizes[n] = ui(n, n + '.png', 200, 200)
for n in ['t_porter', 't_sledge', 't_ox', 't_boat', 'r_granite', 'icon_speed', 'icon_full', 'icon_target']:
    sizes[n] = ui(n, n + '.png', 180, 180)
for n in ['quay', 'granite']:
    im = key_white(Image.open(os.path.join(SRC, 'v3', n + '.png')))
    im = trim(im); im = fit(im, 240, 240)
    im.save(os.path.join(OUT, 'ui', 'b_' + n + '.webp'), 'WEBP', quality=88, method=6)
tex('mudbrick', '../v3/mudbrick.png', (512, 512))
json.dump({k: list(v) for k, v in sizes.items()}, open(os.path.join(OUT, 'ui', 'sizes.json'), 'w'), indent=0)
print('route assets ok')

# ---------------- road game additions ----------------
for n in ['btn_road', 'btn_erase']:
    sizes[n] = ui(n, n + '.png', 200, 200)
for n in ['t_path', 't_track', 'r_store']:
    sizes[n] = ui(n, n + '.png', 180, 180)
json.dump({k: list(v) for k, v in sizes.items()}, open(os.path.join(OUT, 'ui', 'sizes.json'), 'w'), indent=0)
print('road assets ok')

# ---------------- brick ramp additions ----------------
for n in ['btn_undo']:
    sizes[n] = ui(n, n + '.png', 200, 200)
for n in ['r_brick']:
    sizes[n] = ui(n, n + '.png', 160, 160)
im = key_white(Image.open(os.path.join(SRC, 'v4', 'brickworks.png')))
im = trim(im); im = fit(im, 240, 240)
im.save(os.path.join(OUT, 'ui', 'b_brickworks.webp'), 'WEBP', quality=88, method=6)
json.dump({k: list(v) for k, v in sizes.items()}, open(os.path.join(OUT, 'ui', 'sizes.json'), 'w'), indent=0)
print('brick assets ok')
