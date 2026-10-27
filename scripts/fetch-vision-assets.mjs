/**
 * Explicit local asset preparation: npm run assets:vision
 * Google documents the @mediapipe jsDelivr distribution here:
 * https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter/web_js
 * Model source: https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter
 * Runtime inference only reads these local files. No camera frames are uploaded.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, statfs, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const packageVersion = '0.10.35';
const wasmBase = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${packageVersion}/wasm`;
const assets = [
  { path: 'wasm/vision_wasm_module_internal.js', url: `${wasmBase}/vision_wasm_module_internal.js`, sha256: 'Hx1iFTJKH+YvZ0LUmj25ERcJh8oYrYwbdfGhyCrPK0Q=', kind: 'loader' },
  { path: 'wasm/vision_wasm_module_internal.wasm', url: `${wasmBase}/vision_wasm_module_internal.wasm`, sha256: 'YXuOAkjb0n6dfs5CGABOrkzvtJkZbRu0+g4/7yFwh1Y=', kind: 'wasm' },
  { path: 'selfie_segmenter_landscape.tflite', url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/1/selfie_segmenter_landscape.tflite', kind: 'model' },
];
const destination = resolve(root, 'public/assets/vision');
const sha256 = (data) => createHash('sha256').update(data).digest('base64');
const hasSignature = (data, kind) => kind === 'wasm'
  ? data.subarray(0, 4).equals(Buffer.from([0, 97, 115, 109]))
  : kind === 'model' ? data.subarray(4, 8).toString() === 'TFL3'
    : data.includes(Buffer.from('ModuleFactory'));

async function main() {
  const project = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  if (project.dependencies?.['@mediapipe/tasks-vision'] !== packageVersion) throw new Error(`Expected @mediapipe/tasks-vision ${packageVersion}; update the runtime and asset pins together.`);
  const disk = await statfs(root);
  if (Number(disk.bavail) * Number(disk.bsize) < 2 * 1024 ** 3 + 32 * 1024 ** 2) throw new Error('Asset preparation needs at least 2 GiB free headroom plus 32 MiB. No files changed.');
  const records = [];
  for (const asset of assets) {
    const target = resolve(destination, asset.path);
    let data;
    try { data = await readFile(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const existingValid = data && hasSignature(data, asset.kind) && (!asset.sha256 || sha256(data) === asset.sha256);
    if (!existingValid) {
      if (process.argv.includes('--check')) throw new Error(`Missing or invalid local asset: ${asset.path}`);
      console.log(`Fetching ${asset.path}`);
      const response = await fetch(asset.url, { signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error(`Asset download failed (${response.status}): ${asset.url}`);
      data = Buffer.from(await response.arrayBuffer());
      if (!hasSignature(data, asset.kind)) throw new Error(`Unexpected file format for ${asset.path}`);
      if (asset.sha256 && sha256(data) !== asset.sha256) throw new Error(`SHA-256 mismatch for ${asset.path}`);
      const googleMd5 = response.headers.get('x-goog-hash')?.match(/(?:^|,\s*)md5=([^,]+)/)?.[1];
      if (googleMd5 && createHash('md5').update(data).digest('base64') !== googleMd5) throw new Error(`Google Storage MD5 mismatch for ${asset.path}`);
      await mkdir(dirname(target), { recursive: true });
      const temporary = `${target}.partial-${process.pid}`;
      try { await writeFile(temporary, data); await rename(temporary, target); }
      finally { await rm(temporary, { force: true }); }
    }
    records.push({ path: asset.path, source: asset.url, bytes: data.length, sha256: sha256(data) });
    console.log(`Ready ${asset.path} (${data.length} bytes)`);
  }
  if (!process.argv.includes('--check')) await writeFile(resolve(destination, 'manifest.json'), `${JSON.stringify({ packageVersion, modelVersion: '1', assets: records }, null, 2)}\n`);
  console.log('Vision assets are ready for local inference.');
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
