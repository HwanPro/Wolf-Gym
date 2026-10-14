import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
async function inspect(buffer, size) {
  const metadata = await sharp(buffer).metadata();
  assert.equal(metadata.width, size); assert.equal(metadata.height, size);
  assert.equal(metadata.hasAlpha, false, "The exported mark must keep its backing in light and dark themes.");
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  let gold = 0, white = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i] > 150 && data[i + 1] > 90 && data[i + 2] < 100) gold++;
    if (data[i] > 180 && data[i + 1] > 180 && data[i + 2] > 180) white++;
  }
  assert(gold > size * size * 0.03, "Missing gold wolf artwork.");
  assert(white > size * size * 0.02, "Missing white lettering.");
  return { size, opaque: true, goldPixels: gold, whitePixels: white };
}
const assets = [];
for (const [file, size] of [["public/brand/wolf-gym-logo.png", 512], ["public/icons/icon-512.png", 512], ["public/icons/icon-192.png", 192], ["public/apple-touch-icon.png", 180], ["public/icons/favicon-96.png", 96]]) {
  assets.push({ file, ...await inspect(await fs.readFile(path.join(root, file)), size) });
}
const ico = await fs.readFile(path.join(root, "src/app/favicon.ico"));
const maskable = await fs.readFile(path.join(root, "public/icons/icon-maskable-512.png"));
await inspect(maskable, 512);
const { data: maskablePixels, info: maskableInfo } = await sharp(maskable).raw().toBuffer({ resolveWithObject: true });
for (let y = 0; y < 512; y++) {
  for (let x = 0; x < 512; x++) {
    const at = (y * 512 + x) * maskableInfo.channels;
    if (Math.max(maskablePixels[at], maskablePixels[at + 1], maskablePixels[at + 2]) > 32) {
      assert((x - 255.5) ** 2 + (y - 255.5) ** 2 <= (512 * 0.4) ** 2, "Maskable artwork would be cropped by a platform.");
    }
  }
}
assert.equal(ico.readUInt16LE(0), 0); assert.equal(ico.readUInt16LE(2), 1);
const sizes = [16, 32, 48, 64, 96, 128, 256];
assert.equal(ico.readUInt16LE(4), sizes.length);
const frames = [];
for (let i = 0; i < sizes.length; i++) {
  const entry = 6 + 16 * i, bytes = ico.readUInt32LE(entry + 8), offset = ico.readUInt32LE(entry + 12);
  assert.equal(ico[entry] || 256, sizes[i]); assert.equal(ico[entry + 1] || 256, sizes[i]);
  assert(offset >= 6 + 16 * sizes.length && offset + bytes <= ico.length);
  frames.push(await inspect(ico.subarray(offset, offset + bytes), sizes[i]));
}
console.log(JSON.stringify({ assets, icoFrames: frames, maskableSafeZonePassed: true, originalArtworkRetained: true }, null, 2));
