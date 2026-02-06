/**
 * iOS Splash Screen Generator Script
 * Run with: node scripts/generate-splash-screens.js
 * 
 * Generates branded splash screens for all iOS device sizes.
 * Requires: sharp (npm install sharp)
 */

const fs = require('fs');
const path = require('path');

// Check if sharp is available
let sharp;
try {
    sharp = require('sharp');
} catch (e) {
    console.error('Error: sharp is required. Install with: npm install sharp');
    process.exit(1);
}

const OUTPUT_DIR = path.join(__dirname, '../public/splash');

// All iOS device splash screen sizes
const SIZES = [
    { width: 1290, height: 2796, name: '1290x2796' }, // iPhone 15 Pro Max
    { width: 1179, height: 2556, name: '1179x2556' }, // iPhone 15 Pro
    { width: 1284, height: 2778, name: '1284x2778' }, // iPhone 14 Pro Max
    { width: 1170, height: 2532, name: '1170x2532' }, // iPhone 14
    { width: 1125, height: 2436, name: '1125x2436' }, // iPhone 13 mini
    { width: 1242, height: 2688, name: '1242x2688' }, // iPhone 11 Pro Max
    { width: 828, height: 1792, name: '828x1792' },   // iPhone 11
    { width: 750, height: 1334, name: '750x1334' },   // iPhone SE
    { width: 2048, height: 2732, name: '2048x2732' }, // iPad Pro 12.9"
    { width: 1668, height: 2388, name: '1668x2388' }, // iPad Pro 11"
    { width: 1640, height: 2360, name: '1640x2360' }, // iPad Air
    { width: 1488, height: 2266, name: '1488x2266' }, // iPad mini
];

// Brand colors
const GRADIENT_START = '#D4A574'; // Gold
const GRADIENT_END = '#E8B4B8';   // Pink

async function generateSplashScreens() {
    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    console.log('Generating iOS splash screens...\n');

    for (const size of SIZES) {
        const { width, height, name } = size;

        // Create SVG with gradient background and centered logo text
        const svg = `
            <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style="stop-color:#FAFAFA"/>
                        <stop offset="100%" style="stop-color:#F5F5F7"/>
                    </linearGradient>
                    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style="stop-color:${GRADIENT_START}"/>
                        <stop offset="100%" style="stop-color:${GRADIENT_END}"/>
                    </linearGradient>
                </defs>
                <rect width="100%" height="100%" fill="url(#bg)"/>
                
                <!-- Logo circle -->
                <circle cx="${width / 2}" cy="${height / 2 - 40}" r="60" fill="url(#accent)"/>
                
                <!-- O letter in circle -->
                <text x="${width / 2}" y="${height / 2 - 20}" 
                      font-family="Inter, system-ui, sans-serif" 
                      font-size="72" 
                      font-weight="700" 
                      fill="white" 
                      text-anchor="middle">O</text>
                
                <!-- Brand name below -->
                <text x="${width / 2}" y="${height / 2 + 80}" 
                      font-family="Inter, system-ui, sans-serif" 
                      font-size="48" 
                      font-weight="600" 
                      fill="url(#accent)" 
                      text-anchor="middle">Overseek</text>
            </svg>
        `;

        const outputPath = path.join(OUTPUT_DIR, `${name}.png`);

        try {
            await sharp(Buffer.from(svg))
                .png()
                .toFile(outputPath);

            console.log(`✓ Generated ${name}.png`);
        } catch (err) {
            console.error(`✗ Failed to generate ${name}.png:`, err.message);
        }
    }

    console.log('\nDone! Splash screens saved to:', OUTPUT_DIR);
}

generateSplashScreens().catch(console.error);
