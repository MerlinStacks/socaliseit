# Patched minimatch compatibility adapter

The current Next.js ESLint preset still pulls minimatch 3 and 10. The upstream
fix for GHSA-g3hv-75wg-m249 is only available in minimatch 11.0.1 or later.
Overriding every dependency directly to 11 breaks plugins that call the CommonJS
module as a function.

This private, development-only package adapts that callable export shape and
forwards both legacy and modern APIs to **upstream minimatch 11.0.3+**. It does not
copy old matching code, suppress audit results, or change lint rules. The alias
dependency `minimatch-patched` remains visible to npm audit and the lockfile.

The `makeRe` compatibility method supplies the `.test(path)` interface used by
`import/no-internal-modules`, delegating to the patched `Minimatch.match`. It does
not generate a `RegExp` or promise regex serialization/`.source` support: upstream
11 deliberately removed regex generation. No legacy glob engine is retained.

Run `npm run test:lint-toolchain` to verify exports, matching, and real ESLint
rules. Docker's dependency stage copies this local package before `npm ci`.
The checked-in `.npmrc` uses `install-links=true` so transitive overrides install
real package contents rather than non-portable relative directory symlinks.
Remove the adapter and its override when the lint dependencies support the
patched upstream API natively.
