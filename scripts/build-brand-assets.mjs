import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const original = await fs.readFile(path.join(root, "assets/brand/wolf-gym-master.png"));
const { data, info } = await sharp(original).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let left = info.width, top = info.height, right = 0, bottom = 0;
for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] > 8) {
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
}
const crop = { left, top, width: right - left + 1, height: bottom - top + 1 };

// Export the existing artwork on its own opaque backing; do not repaint it.
async function exportLogo(size, padding = 0.08) {
  const inner = Math.round(size * (1 - padding * 2));
  const logo = await sharp(original).extract(crop).resize(inner, inner, { fit: "inside" }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 3, background: "#080808" } })
    .composite([{ input: logo, gravity: "centre" }]).removeAlpha().png().toBuffer();
}

const exports = [
  ["public/brand/wolf-gym-logo.png", 512],
  ["public/icons/icon-512.png", 512],
  ["public/icons/icon-192.png", 192],
  ["public/apple-touch-icon.png", 180],
  ["public/icons/favicon-96.png", 96],
];
for (const [file, size] of exports) {
  await fs.writeFile(path.join(root, file), await exportLogo(size));
}
// A maskable launcher icon needs extra space for circular platform crops.
await fs.writeFile(path.join(root, "public/icons/icon-maskable-512.png"), await exportLogo(512, 0.18));

// ICO directory entries contain lossless PNG frames at actual browser sizes.
const sizes = [16, 32, 48, 64, 96, 128, 256];
const frames = await Promise.all(sizes.map(size => exportLogo(size, 0.04)));
const header = Buffer.alloc(6 + 16 * frames.length);
header.writeUInt16LE(1, 2); header.writeUInt16LE(frames.length, 4);
let offset = header.length;
frames.forEach((frame, index) => {
  const entry = 6 + index * 16;
  header[entry] = sizes[index] === 256 ? 0 : sizes[index];
  header[entry + 1] = header[entry];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(frame.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});
await fs.writeFile(path.join(root, "src/app/favicon.ico"), Buffer.concat([header, ...frames]));
console.log("Exported opaque Wolf Gym logos and seven favicon sizes from the original artwork.");
