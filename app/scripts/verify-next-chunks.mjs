import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const nextDir = join(process.cwd(), '.next');
const serverDir = join(nextDir, 'server');
const missing = new Set();

function checkManifests(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);

        if (entry.isDirectory()) {
            checkManifests(path);
            continue;
        }

        if (entry.name !== 'react-loadable-manifest.json') continue;

        const manifest = JSON.parse(readFileSync(path, 'utf8'));
        for (const module of Object.values(manifest)) {
            for (const file of module.files ?? []) {
                if (!existsSync(join(nextDir, file))) missing.add(file);
            }
        }
    }
}

checkManifests(serverDir);

if (missing.size > 0) {
    console.error('Next.js build references missing static chunks:');
    for (const file of [...missing].sort()) console.error(`- ${file}`);
    process.exit(1);
}

console.log('All loadable Next.js chunks are present.');
