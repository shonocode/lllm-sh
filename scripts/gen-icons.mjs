#!/usr/bin/env node
/* Generate PWA icons from public/icon.png.
 *
 * iOS-friendly: full-bleed (no padding), black background, no transparency on
 * apple-touch-icon. iOS would otherwise show transparent areas as white.
 *
 * Output:
 *   public/apple-touch-icon.png  180x180 (iOS home screen)
 *   public/icon-192.png          192x192 (Android / manifest)
 *   public/icon-512.png          512x512 (Android / manifest, also maskable)
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const pngSrc = join(root, 'public', 'icon.png');
const svgSrc = join(root, 'public', 'icon.svg');

let src;
if (existsSync(pngSrc)) {
  src = pngSrc;
  console.log('source: public/icon.png');
} else if (existsSync(svgSrc)) {
  src = svgSrc;
  console.log('source: public/icon.svg (fallback — drop a high-res public/icon.png for sharper output)');
} else {
  console.error('No source icon found. Place a square PNG (≥512x512) at public/icon.png and re-run.');
  process.exit(1);
}

const targets = [
  { out: 'public/apple-touch-icon.png', size: 180 },
  { out: 'public/icon-192.png', size: 192 },
  { out: 'public/icon-512.png', size: 512 },
];

const BG = { r: 0, g: 0, b: 0, alpha: 1 }; // solid black, no transparency

for (const t of targets) {
  const outPath = join(root, t.out);
  await sharp(src)
    .resize(t.size, t.size, {
      fit: 'contain',
      background: BG,
    })
    .flatten({ background: BG }) // collapse alpha to opaque black — iOS-safe
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log('wrote ' + t.out + ' (' + t.size + 'x' + t.size + ')');
}

console.log('\ndone. commit the generated PNGs alongside public/icon.png.');
