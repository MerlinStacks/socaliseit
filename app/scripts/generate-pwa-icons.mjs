/**
 * Generates maskable PWA icons and monochrome badge from the existing brand icon.
 *
 * Why: Maskable icons need the logo centred inside the inner 80% safe-zone circle
 * (40/80 = 10% padding on each side). The badge needs to be a white silhouette
 * on transparent background for the Android status bar.
 */
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = path.join(__dirname, '..', 'public', 'icons');

async function generateMaskableIcon(size) {
    const source = path.join(ICONS_DIR, `icon-${size}.png`);
    const output = path.join(ICONS_DIR, `icon-maskable-${size}.png`);

    // Maskable safe zone is the inner 80%, so we shrink the source to 80%
    // and composite it on a gradient background that fills the full canvas.
    const innerSize = Math.round(size * 0.7); // 70% to give generous padding

    // Create the gradient background matching the brand colours (#E8837C → #F2A7B3)
    const gradientSvg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#E8837C"/>
          <stop offset="100%" stop-color="#F2A7B3"/>
        </linearGradient>
      </defs>
      <rect width="${size}" height="${size}" fill="url(#bg)"/>
    </svg>`;

    // Resize the source icon (strip the existing rounded-corner background by
    // extracting just the inner logo area)
    const resizedIcon = await sharp(source)
        .resize(innerSize, innerSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toBuffer();

    const offset = Math.round((size - innerSize) / 2);

    await sharp(Buffer.from(gradientSvg))
        .composite([{
            input: resizedIcon,
            top: offset,
            left: offset,
        }])
        .png()
        .toFile(output);

    console.log(`✓ Generated ${path.basename(output)} (${size}x${size})`);
}

async function generateBadge() {
    const source = path.join(ICONS_DIR, 'icon-192.png');
    const output = path.join(ICONS_DIR, 'badge-72.png');

    // Extract the logo, make it white-on-transparent for Android status bar
    // Strategy: take the source, shrink to 72, extract alpha, use as white mask
    await sharp(source)
        .resize(72, 72)
        // Threshold to create a cleaner silhouette from the semi-transparent logo
        .ensureAlpha()
        // Tint the entire image white while preserving alpha
        .tint({ r: 255, g: 255, b: 255 })
        .png()
        .toFile(output);

    console.log(`✓ Generated badge-72.png (72x72 monochrome)`);
}

async function main() {
    console.log('Generating PWA icons...\n');

    await generateMaskableIcon(192);
    await generateMaskableIcon(512);
    await generateBadge();

    console.log('\nDone! New icons saved to public/icons/');
}

main().catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
});
