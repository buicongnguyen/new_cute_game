// After `vite build`: compresses every model in dist/assets/models with meshopt (gltfpack), so the phone download stays
// under budget (design §16). The Blender generators keep writing plain GLBs to public/; only the built site is packed.
// Flags: -cc meshopt with the higher ratio; -noq keeps float vertices and plain node transforms (the code scales and
// moves named nodes, and quantized meshes would carry their dequantization in those transforms); -kn, -km and -ke keep
// the named nodes, the pal_*/glow_* material names and extras that the art contract and bakeColors rely on.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'dist/assets/models';
const cli = createRequire(import.meta.url).resolve('gltfpack/cli.js');
let before = 0, after = 0;
// Include the borrowed/ subtree; each relative filename remains intact.
function modelFiles(folder, prefix = '') {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? modelFiles(join(folder, entry.name), join(prefix, entry.name))
    : entry.name.endsWith('.glb') ? [join(prefix, entry.name)] : []);
}
for (const file of modelFiles(dir)) {
  const path = join(dir, file), size = statSync(path).size;
  before += size;
  // Already meshopt-compressed (the owner's Zoo Garden house kit): leave it.
  if (readFileSync(path).subarray(0, 4096).toString('latin1').includes('EXT_meshopt_compression')) { after += size; console.log(`${file}: kept (${size} B)`); continue; }
  const tmp = `${path}.packed.glb`;
  execFileSync(process.execPath, [cli, '-i', path, '-o', tmp, '-cc', '-noq', '-kn', '-km', '-ke'], { stdio: ['ignore', 'ignore', 'inherit'] });
  renameSync(tmp, path);
  const packed = statSync(path).size;
  after += packed;
  console.log(`${file}: ${size} → ${packed} B`);
}
console.log(`models: ${(before / 1e6).toFixed(2)} MB → ${(after / 1e6).toFixed(2)} MB`);
