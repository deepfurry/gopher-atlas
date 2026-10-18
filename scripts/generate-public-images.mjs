// Explicit local asset regeneration only; never runs during publication.
// Reuses Astro's existing sharp dependency. Source SVGs remain authoritative.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
const web = createRequire(new URL('../apps/web/package.json', import.meta.url));
const sharp = createRequire(web.resolve('astro'))('sharp');
const asset = (path) => new URL(`../apps/web/${path}`, import.meta.url);
const icon = readFileSync(asset('public/favicon.svg'));
const sizes = [16, 32, 48];
const pngs = await Promise.all(
  sizes.map((size) => sharp(icon).resize(size, size).png().toBuffer()),
);
writeFileSync(asset('public/favicon-32.png'), pngs[1]);
await sharp(icon)
  .resize(180, 180)
  .png()
  .toFile(fileURLToPath(asset('public/apple-touch-icon.png')));
// ICO directory with PNG-compressed 32-bit entries, supported by modern browsers/Windows.
const directory = Buffer.alloc(6 + 16 * sizes.length);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
sizes.forEach((size, i) => {
  const p = 6 + i * 16;
  directory[p] = directory[p + 1] = size;
  directory.writeUInt16LE(1, p + 4);
  directory.writeUInt16LE(32, p + 6);
  directory.writeUInt32LE(pngs[i].length, p + 8);
  directory.writeUInt32LE(offset, p + 12);
  offset += pngs[i].length;
});
writeFileSync(asset('public/favicon.ico'), Buffer.concat([directory, ...pngs]));
writeFileSync(
  asset('public/images/og-default.png'),
  await sharp(readFileSync(asset('src/assets/og-default.svg')))
    .png()
    .toBuffer(),
);
