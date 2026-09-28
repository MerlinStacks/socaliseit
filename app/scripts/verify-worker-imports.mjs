import { readFileSync } from 'node:fs';

// Workers run in plain Node, not Next's runtime/module loader. Inspect the
// emitted bundle imports so tree-shaken type-only dependencies are permitted.
const metadataPath = process.argv[2];
if (!metadataPath) throw new Error('Usage: node scripts/verify-worker-imports.mjs <esbuild-metafile>');
const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
const forbidden = new Set();
for (const output of Object.values(metadata.outputs)) {
    for (const dependency of output.imports) {
        if (/^(next|next-auth)(\/|$)/.test(dependency.path)) forbidden.add(dependency.path);
    }
}
if (forbidden.size) {
    throw new Error(`Worker bundle imports web-only packages: ${[...forbidden].join(', ')}. Move shared definitions into worker-safe modules.`);
}
console.log('Worker dependency check passed: no Next.js or NextAuth runtime imports.');
