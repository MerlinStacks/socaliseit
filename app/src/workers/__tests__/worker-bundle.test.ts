// @vitest-environment node
import { build } from 'esbuild';
import { expect, it } from 'vitest';

it('keeps the production worker bundle free of Next.js and NextAuth runtime imports', async () => {
    // Match Dockerfile's worker-builder options. Bundle only: do not execute jobs or
    // connect to a database/Redis. write:false leaves no build artifacts in the repo.
    const result = await build({
        entryPoints: ['src/workers/index.ts'], bundle: true, platform: 'node',
        packages: 'external', tsconfig: 'tsconfig.json', outfile: 'dist/worker.js',
        define: { 'import.meta.url': JSON.stringify('file:///app/src/generated/prisma/client.ts') },
        metafile: true, write: false,
    });
    const imports = Object.values(result.metafile!.outputs).flatMap(output => output.imports.map(dependency => dependency.path));
    expect(imports.filter(path => /^(next|next-auth)(\/|$)/.test(path))).toEqual([]);
}, 30_000);
