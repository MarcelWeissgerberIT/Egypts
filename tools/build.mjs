// Build both games: the platformer "Purpurpyramide" into dist/ and the pyramid builder into dist/builder/.
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = path.join(ROOT, 'dist');
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

function copy(src, dst, filter = () => true) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copy(s, d, filter);
    else if (filter(e.name) && (!e.name.endsWith('.json') || e.name === 'manifest.json')) fs.copyFileSync(s, d);
  }
}
const bundle = (entry, out) => build({ entryPoints: [entry], bundle: true, minify: true, format: 'iife', target: ['safari15', 'chrome100'], outfile: out, legalComments: 'none' });
const page = (htmlFile, cssFile, out) => fs.writeFileSync(out, fs.readFileSync(htmlFile, 'utf8').replace('/*CSS*/', fs.readFileSync(cssFile, 'utf8')));

// ---- pyramid builder (the first game) at /builder/
const B = path.join(DIST, 'builder');
fs.mkdirSync(B, { recursive: true });
await bundle(path.join(ROOT, 'src/main.js'), path.join(B, 'game.js'));
page(path.join(ROOT, 'src/index.html'), path.join(ROOT, 'src/style.css'), path.join(B, 'index.html'));
copy(path.join(ROOT, 'public/assets'), path.join(B, 'assets'));
fs.copyFileSync(path.join(ROOT, 'public/manifest.json'), path.join(B, 'manifest.json'));

// ---- platformer at the root
await bundle(path.join(ROOT, 'jump/src/main.js'), path.join(DIST, 'game.js'));
page(path.join(ROOT, 'jump/index.html'), path.join(ROOT, 'jump/style.css'), path.join(DIST, 'index.html'));
copy(path.join(ROOT, 'jump/assets'), path.join(DIST, 'assets'));
fs.copyFileSync(path.join(ROOT, 'jump/manifest.json'), path.join(DIST, 'manifest.json'));
const shared = {
  ui: ['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9', 'd_x', 'd_plus', 'icon_ankh', 'icon_scarab', 'icon_eye', 'icon_eye_empty', 'icon_lock', 'icon_rotate',
    'btn_pause', 'btn_play', 'btn_restart', 'btn_home', 'btn_next', 'btn_sound_on', 'btn_sound_off', 'panel', 'medallion', 'banner_win', 'sparkle', 'hand'].map((n) => n + '.webp'),
  tex: ['water.jpg', 'sand.jpg', 'dust.webp'],
  models: ['obelisk.glb', 'worker_lp.glb', 'anim_lp_walk.glb'],
  audio: ['fanfare.mp3'],
  '.': ['apple-touch-icon.png', 'icon-512.png', 'favicon.png'],
};
for (const [dir, files] of Object.entries(shared)) {
  fs.mkdirSync(path.join(DIST, 'assets', dir), { recursive: true });
  for (const f of files) fs.copyFileSync(path.join(ROOT, 'public/assets', dir, f), path.join(DIST, 'assets', dir, f));
}
const size = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((a, e) => a + (e.isDirectory() ? size(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
console.log('dist', (size(DIST) / 1048576).toFixed(2) + ' MB', 'platformer game.js', (fs.statSync(path.join(DIST, 'game.js')).size / 1024).toFixed(0) + ' KB', 'builder', (size(B) / 1048576).toFixed(2) + ' MB');
