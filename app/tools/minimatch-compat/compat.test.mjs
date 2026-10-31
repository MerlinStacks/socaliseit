import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../package.json', import.meta.url));
const minimatch = require('minimatch');
const adapterRequire = createRequire(require.resolve('minimatch'));
const upstream = adapterRequire('minimatch-patched');

test('the installed adapter delegates to audited upstream minimatch 11', () => {
    assert.equal(require('minimatch/package.json').name, '@overseek/minimatch-compat');
    assert.match(adapterRequire('minimatch-patched/package.json').version, /^11\./);
    assert.equal(minimatch.Minimatch, upstream.Minimatch);
    assert.equal(minimatch.minimatch, upstream.minimatch);
});

test('legacy callable CommonJS and modern ESM named exports both work', async () => {
    const esm = await import('minimatch');
    assert.equal(typeof minimatch, 'function');
    assert.equal(typeof esm.default, 'function');
    assert.equal(typeof esm.Minimatch, 'function');
    assert.equal(esm.minimatch('src/Button.tsx', '**/*.tsx'), true);
    assert.equal(new esm.Minimatch('**/*.tsx').match('src/Button.tsx'), true);
    assert.equal(esm.default('src/Button.tsx', '**/*.tsx'), true);
    assert.equal(esm.makeRe('src/**').test('src/Button.tsx'), true);
});

test('glob syntax and matching options remain available to lint rules', () => {
    const cases = [
        ['src/Button.tsx', 'src/**/*.{ts,tsx}', {}, true],
        ['src/.cache/file.ts', 'src/**/*.ts', {}, false],
        ['src/.cache/file.ts', 'src/**/*.ts', { dot: true }, true],
        ['src/file.ts', '!**/*.test.ts', {}, true],
        ['src/file.test.ts', '!**/*.test.ts', {}, false],
        ['foo/bar', '@(foo|baz)/**', {}, true],
        ['FOO.TS', '*.ts', { nocase: true }, true],
    ];
    for (const [file, pattern, options, expected] of cases) {
        assert.equal(minimatch(file, pattern, options), expected, `${file} matches ${pattern}`);
        assert.equal(new minimatch.Minimatch(pattern, options).match(file), expected);
    }
    assert.deepEqual(minimatch.braceExpand('src/*.{ts,tsx}'), ['src/*.ts', 'src/*.tsx']);
});

test('legacy filter, match, makeRe, and defaults APIs use the patched matcher', () => {
    const files = ['src/a.ts', 'src/b.tsx', 'README.md'];
    assert.deepEqual(files.filter(minimatch.filter('**/*.ts')), ['src/a.ts']);
    assert.deepEqual(minimatch.match(files, '**/*.tsx'), ['src/b.tsx']);
    assert.equal(minimatch.makeRe('src/**/*.ts').test('src/a.ts'), true);
    const defaults = minimatch.defaults({ dot: true });
    assert.equal(defaults('.hidden', '*'), true);
    assert.equal(defaults('.hidden', '*', { dot: false }), false);
    assert.equal(defaults.makeRe('*').test('.hidden'), true);
    assert.equal(new defaults.Minimatch('*').match('.hidden'), true);
});

test('ESLint keeps its configured file selection and global ignores', async () => {
    const { ESLint } = require('eslint');
    const eslint = new ESLint({ cwd });
    assert.equal(await eslint.isPathIgnored(path.join(cwd, '.next/probe.tsx')), true);
    assert.equal(await eslint.isPathIgnored(path.join(cwd, 'src/lint-toolchain-probe.tsx')), false);
    const results = await eslint.lintFiles(['src/lib/calendar-date-range.ts']);
    assert.equal(results.length, 1);
    assert.equal(results[0].errorCount, 0);
});

test('real React, accessibility, and import rules still enforce glob-based options', async () => {
    const { ESLint } = require('eslint');
    const eslint = new ESLint({ cwd, overrideConfig: { rules: {
        'react/forbid-component-props': ['error', { forbid: [{ propName: 'foo', allowedForPatterns: ['Safe*'] }] }],
        'jsx-a11y/label-has-associated-control': ['error', { controlComponents: ['Input*'] }],
        'import/order': ['error', { groups: ['builtin', 'external', 'internal'],
            pathGroups: [{ pattern: '@/**', group: 'internal' }] }],
        'import/no-internal-modules': ['error', { forbid: ['date-fns/**'] }],
    } } });
    const [result] = await eslint.lintText(`
        import { thing } from '@/internal/private';
        import fs from 'node:fs';
        import { addDays } from 'date-fns/addDays';
        const value: number = 1;
        export const Unsafe = () => <Widget foo={value} />;
        export const Allowed = () => <SafeWidget foo={value} />;
        export const MissingLabel = () => <label><InputWidget /></label>;
    `, { filePath: 'src/lint-toolchain-probe.tsx' });
    assert.equal(result.fatalErrorCount, 0);
    assert.equal(result.messages.filter(message => message.ruleId === 'react/forbid-component-props').length, 1);
    assert.ok(result.messages.some(message => message.ruleId === 'jsx-a11y/label-has-associated-control'));
    assert.ok(result.messages.some(message => message.ruleId === 'import/order'));
    assert.equal(result.messages.filter(message => message.ruleId === 'import/no-internal-modules').length, 1);
});

test('the amplification regression pattern completes in an isolated process', () => {
    const result = spawnSync(process.execPath, ['-e', `
        const { Minimatch } = require('minimatch');
        new Minimatch('**/../'.repeat(24) + 'file', { optimizationLevel: 2 }).match('file');
    `], { cwd, timeout: 10_000, encoding: 'utf8' });
    assert.equal(result.status, 0, result.error?.message || result.stderr);
});
