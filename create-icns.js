#!/usr/bin/env node
// Creates icon.icns from icon.png using macOS iconutil
// Run on macOS only (part of GitHub Actions build)

const { execSync } = require('child_process');
const path = require('path');
const sharp = require('sharp');
const fs = require('fs');

const SOURCE = path.join(__dirname, 'icon.png');
const ICONSET = path.join(__dirname, 'icon.iconset');
const OUTPUT = path.join(__dirname, 'icon.icns');

const SIZES = [
  { name: 'icon_16x16.png', size: 16 },
  { name: 'icon_16x16@2x.png', size: 32 },
  { name: 'icon_32x32.png', size: 32 },
  { name: 'icon_32x32@2x.png', size: 64 },
  { name: 'icon_128x128.png', size: 128 },
  { name: 'icon_128x128@2x.png', size: 256 },
  { name: 'icon_256x256.png', size: 256 },
  { name: 'icon_256x256@2x.png', size: 512 },
  { name: 'icon_512x512.png', size: 512 },
  { name: 'icon_512x512@2x.png', size: 1024 },
];

async function main() {
  // Create iconset directory
  if (fs.existsSync(ICONSET)) fs.rmSync(ICONSET, { recursive: true });
  fs.mkdirSync(ICONSET);

  // Generate all required sizes
  for (const { name, size } of SIZES) {
    await sharp(SOURCE)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(ICONSET, name));
    console.log(`  Created ${name} (${size}x${size})`);
  }

  // Convert to icns using iconutil (macOS only)
  execSync(`iconutil -c icns "${ICONSET}" -o "${OUTPUT}"`);
  console.log(`Created ${OUTPUT}`);

  // Cleanup iconset directory
  fs.rmSync(ICONSET, { recursive: true });
}

main().catch(err => {
  console.error('Failed to create icns:', err);
  process.exit(1);
});
