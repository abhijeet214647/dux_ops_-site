import sharp from 'sharp';
import { mkdirSync } from 'fs';

const S = 1024;
mkdirSync('assets', { recursive: true });

const gradSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#141833"/>
    <stop offset="0.5" stop-color="#3B2FB0"/>
    <stop offset="1" stop-color="#6D5EF6"/>
  </linearGradient></defs>
  <rect width="${S}" height="${S}" fill="url(#g)"/>
</svg>`;

const grad = await sharp(Buffer.from(gradSvg)).png().toBuffer();

async function centered(markWidth) {
  const mark = await sharp('www/dux-mark-white.png').resize({ width: markWidth }).toBuffer();
  const m = await sharp(mark).metadata();
  return { input: mark, left: Math.round((S - m.width) / 2), top: Math.round((S - m.height) / 2) };
}

// Full-bleed logo (splash + legacy/round icon): gradient + mark
await sharp(grad).composite([await centered(560)]).png().toFile('assets/logo.png');

// Adaptive icon background: gradient
await sharp(grad).png().toFile('assets/icon-background.png');

// Adaptive icon foreground: white mark on transparent, padded into the safe zone
const transparent = { create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } };
await sharp(transparent).composite([await centered(470)]).png().toFile('assets/icon-foreground.png');

console.log('icon sources written to assets/');
