'use strict';

// Older ESLint plugins call require('minimatch') directly; newer consumers use
// named exports. Only adapt that export shape: all glob parsing/matching stays
// in the patched upstream package, with no vendored legacy implementation.
function legacyExports(api) {
    const match = typeof api === 'function' ? api : api.minimatch;
    return Object.assign((...args) => match(...args), api, {
        // import/no-internal-modules uses only makeRe(...).test(path). Upstream
        // 11 removed regex generation; keep its safe matcher instead of rebuilding regexes.
        makeRe: (pattern, options) => {
            const matcher = new api.Minimatch(pattern, options);
            return Object.freeze({ test: value => matcher.match(String(value)) });
        },
        defaults: options => legacyExports(api.defaults(options)),
    });
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Legacy CommonJS entry point.
module.exports = legacyExports(require('minimatch-patched'));
