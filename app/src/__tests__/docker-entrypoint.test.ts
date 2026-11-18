// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function runEntrypoint(failOn = '') {
    const cwd = mkdtempSync(join(tmpdir(), 'socialiseit-entrypoint-'));
    try {
        const bin = join(cwd, 'bin');
        mkdirSync(bin);
        for (const command of ['mkdir', 'chown']) {
            writeFileSync(join(bin, command), '#!/bin/sh\nexit 0\n', { mode: 0o700 });
        }
        writeFileSync(join(bin, 'gosu'), '#!/bin/sh\necho app-started\n', { mode: 0o700 });
        writeFileSync(join(bin, 'node'), `#!/bin/sh
echo "$2 $3 $5"
if [ -n "$FAIL_ON" ]; then
    case "$*" in *"$FAIL_ON"*) exit 1 ;; esac
fi
`, { mode: 0o700 });
        return spawnSync('sh', [resolve('docker-entrypoint.sh')], {
            cwd, encoding: 'utf8',
            env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, AUTH_SECRET: 'test', ENCRYPTION_KEY: 'test', FAIL_ON: failOn },
        });
    } finally {
        rmSync(cwd, { recursive: true, force: true });
    }
}

describe('Docker web entrypoint', () => {
    it('runs the Seb migration after schema sync and before startup', () => {
        const result = runEntrypoint();
        expect(result.status).toBe(0);
        expect(result.stdout).toMatch(/db push[\s\S]*db execute .*20260915130000_unify_seb_model[\s\S]*app-started/);
    });

    it.each(['db push', '20260915130000_unify_seb_model'])('does not start the app after %s fails', failure => {
        const result = runEntrypoint(failure);
        expect(result.status).toBe(1);
        expect(result.stdout).not.toContain('app-started');
        expect(result.stderr).toContain('refusing to start');
    });
});
