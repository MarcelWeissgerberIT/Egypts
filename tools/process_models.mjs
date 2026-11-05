// Optimise the Meshy GLBs from art/src/glb for mobile: smaller WebP textures,
// meshopt-compressed geometry, and animation-only GLBs for the extra clips.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { prune, dedup, textureCompress, meshopt, resample, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'art/src/glb');
const OUT = path.join(ROOT, 'public/assets/models');
fs.mkdirSync(OUT, { recursive: true });

await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});

const SIZES = { worker: 1024, pharaoh: 1024, priestess: 1024, sphinx: 1024, temple: 1024, camel: 768, boat: 768,
  obelisk: 512, palm: 768, sledge: 512, anubis: 768, brazier: 512 };

async function full(name) {
  const doc = await io.read(path.join(SRC, name + '.glb'));
  const size = SIZES[name] || 512;
  for (const m of doc.getRoot().listMaterials()) { m.setAlphaMode('OPAQUE'); m.setDoubleSided(false); }
  await doc.transform(
    dedup(), prune(), resample(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 82 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  await io.write(path.join(OUT, name + '.glb'), doc);
  console.log(name, (fs.statSync(path.join(OUT, name + '.glb')).size / 1024).toFixed(0) + 'KB');
}

async function clip(src, outName, clipName) {
  const doc = await io.read(path.join(SRC, src + '.glb'));
  const root = doc.getRoot();
  for (const n of root.listNodes()) { if (n.getMesh()) n.setMesh(null); if (n.getSkin()) n.setSkin(null); }
  for (const m of root.listMeshes()) m.dispose();
  for (const s of root.listSkins()) s.dispose();
  for (const t of root.listTextures()) t.dispose();
  for (const m of root.listMaterials()) m.dispose();
  for (const a of root.listAnimations()) a.setName(clipName);
  await doc.transform(prune({ keepLeaves: true }), resample());
  await io.write(path.join(OUT, outName + '.glb'), doc);
  console.log(outName, (fs.statSync(path.join(OUT, outName + '.glb')).size / 1024).toFixed(0) + 'KB');
}

const which = process.argv[2] || 'full';
if (which === 'full') {
  for (const n of Object.keys(SIZES)) if (fs.existsSync(path.join(SRC, n + '.glb'))) await full(n);
} else {
  const clips = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/clips.json'), 'utf8'));
  for (const [src, out, nm] of clips) if (fs.existsSync(path.join(SRC, src + '.glb'))) await clip(src, out, nm);
}
