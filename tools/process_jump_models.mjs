// Optimise the explorer GLB and strip the animation-only clips for the platformer (jump/assets/models).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, textureCompress, meshopt, resample } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'art/src/glb');
const OUT = path.join(ROOT, 'jump/assets/models');
fs.mkdirSync(OUT, { recursive: true });
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const doc = await io.read(path.join(SRC, 'explorer.glb'));
for (const m of doc.getRoot().listMaterials()) { m.setAlphaMode('OPAQUE'); m.setDoubleSided(false); }
for (const a of doc.getRoot().listAnimations()) a.setName('Idle');
await doc.transform(dedup(), prune(), resample(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 85 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(path.join(OUT, 'explorer.glb'), doc);
console.log('explorer', (fs.statSync(path.join(OUT, 'explorer.glb')).size / 1024).toFixed(0) + 'KB');

for (const [src, name] of [['ex_run', 'Run'], ['ex_jump', 'Jump'], ['ex_fall', 'Fall'], ['ex_climb', 'Climb'], ['ex_swim', 'Swim'], ['ex_hit', 'Hit'], ['ex_cheer', 'Cheer']]) {
  const d = await io.read(path.join(SRC, src + '.glb'));
  const root = d.getRoot();
  for (const n of root.listNodes()) { if (n.getMesh()) n.setMesh(null); if (n.getSkin()) n.setSkin(null); }
  for (const m of root.listMeshes()) m.dispose();
  for (const s of root.listSkins()) s.dispose();
  for (const t of root.listTextures()) t.dispose();
  for (const m of root.listMaterials()) m.dispose();
  for (const a of root.listAnimations()) a.setName(name);
  await d.transform(prune({ keepLeaves: true }), resample());
  await io.write(path.join(OUT, 'anim_' + name.toLowerCase() + '.glb'), d);
  console.log(name, (fs.statSync(path.join(OUT, 'anim_' + name.toLowerCase() + '.glb')).size / 1024).toFixed(0) + 'KB');
}

// enemies: the beetle (Meta SAM 3D, simplified) and the mummy (rigged with a shuffling walk)
{
  const { simplify, weld } = await import('@gltf-transform/functions');
  const { MeshoptSimplifier } = await import('meshoptimizer');
  await MeshoptSimplifier.ready;
  const J = path.join(ROOT, 'art/src/jump');
  const b = await io.read(path.join(J, 'sam_scarab.glb'));
  for (const m of b.getRoot().listMaterials()) { m.setAlphaMode('OPAQUE'); m.setDoubleSided(false); }
  await b.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.18, error: 0.004 }), dedup(), prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 82 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(path.join(OUT, 'beetle.glb'), b);
  console.log('beetle', (fs.statSync(path.join(OUT, 'beetle.glb')).size / 1024).toFixed(0) + 'KB');
  const m = await io.read(path.join(J, 'mummy_rig.glb'));
  for (const mt of m.getRoot().listMaterials()) { mt.setAlphaMode('OPAQUE'); mt.setDoubleSided(false); }
  for (const a of m.getRoot().listAnimations()) a.setName('Walk');
  await m.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.55, error: 0.003 }), dedup(), prune(), resample(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 82 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(path.join(OUT, 'mummy.glb'), m);
  console.log('mummy', (fs.statSync(path.join(OUT, 'mummy.glb')).size / 1024).toFixed(0) + 'KB');
}
