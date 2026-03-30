const sharp = require('sharp');
const path = require('path');
const pngToIco = require('png-to-ico');
const fs = require('fs');

async function createIcon() {
  // Create a proper icon with dark background and sapphire blue echo wave
  const size = 256;
  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="bg" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#3730a3"/>
        <stop offset="100%" stop-color="#1e1b4b"/>
      </radialGradient>
      <radialGradient id="glow" cx="50%" cy="50%" r="40%">
        <stop offset="0%" stop-color="#4f46e5" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="#4f46e5" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <!-- Rounded square background -->
    <rect width="${size}" height="${size}" rx="48" ry="48" fill="url(#bg)"/>
    <!-- Subtle glow -->
    <circle cx="128" cy="128" r="100" fill="url(#glow)"/>
    <!-- Center dot -->
    <circle cx="128" cy="128" r="16" fill="#4f46e5"/>
    <!-- Inner ring -->
    <path d="M 96 88 A 56 56 0 0 0 96 168" fill="none" stroke="#6366f1" stroke-width="8" stroke-linecap="round" opacity="0.8"/>
    <path d="M 160 88 A 56 56 0 0 1 160 168" fill="none" stroke="#6366f1" stroke-width="8" stroke-linecap="round" opacity="0.8"/>
    <!-- Outer ring -->
    <path d="M 72 56 A 96 96 0 0 0 72 200" fill="none" stroke="#818cf8" stroke-width="7" stroke-linecap="round" opacity="0.5"/>
    <path d="M 184 56 A 96 96 0 0 1 184 200" fill="none" stroke="#818cf8" stroke-width="7" stroke-linecap="round" opacity="0.5"/>
    <!-- Outermost ring -->
    <path d="M 52 32 A 132 132 0 0 0 52 224" fill="none" stroke="#a5b4fc" stroke-width="6" stroke-linecap="round" opacity="0.3"/>
    <path d="M 204 32 A 132 132 0 0 1 204 224" fill="none" stroke="#a5b4fc" stroke-width="6" stroke-linecap="round" opacity="0.3"/>
  </svg>`;

  // Generate multiple sizes
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngBuffers = [];

  for (const s of sizes) {
    const buf = await sharp(Buffer.from(svg))
      .resize(s, s)
      .png()
      .toBuffer();
    pngBuffers.push(buf);
  }

  // Save the 256px as icon.png
  await sharp(Buffer.from(svg))
    .resize(256, 256)
    .png()
    .toFile(path.join(__dirname, 'icon.png'));

  console.log('Created icon.png (256x256)');

  // Also save a 16px tray icon
  await sharp(Buffer.from(svg))
    .resize(16, 16)
    .png()
    .toFile(path.join(__dirname, 'tray.png'));

  console.log('Created tray.png (16x16)');

  // Create ICO from the 256px PNG
  const ico = await pngToIco(path.join(__dirname, 'icon.png'));
  fs.writeFileSync(path.join(__dirname, 'icon.ico'), ico);
  console.log('Created icon.ico');

  console.log('Done! All icons created.');
}

createIcon().catch(console.error);
