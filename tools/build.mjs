// Bundle the game into dist/: index.html (inline CSS), game.js, assets/
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = path.join(ROOT, 'dist');
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

await build({
  entryPoints: [path.join(ROOT, 'src/main.js')],
  bundle: true, minify: true, format: 'iife', target: ['safari15', 'chrome100'],
  outfile: path.join(DIST, 'game.js'), legalComments: 'none',
});

const css = fs.readFileSync(path.join(ROOT, 'src/style.css'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8').replace('/*CSS*/', css);
fs.writeFileSync(path.join(DIST, 'index.html'), html);

function copy(src, dst) {
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); copy(s, d); }
    else if (!e.name.endsWith('.json') || e.name === 'manifest.json') fs.copyFileSync(s, d);
  }
}
fs.mkdirSync(path.join(DIST, 'assets'), { recursive: true });
copy(path.join(ROOT, 'public/assets'), path.join(DIST, 'assets'));
fs.copyFileSync(path.join(ROOT, 'public/manifest.json'), path.join(DIST, 'manifest.json'));
const size = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((a, e) => a + (e.isDirectory() ? size(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
console.log('dist', (size(DIST) / 1048576).toFixed(2) + ' MB', 'game.js', (fs.statSync(path.join(DIST, 'game.js')).size / 1024).toFixed(0) + ' KB');
