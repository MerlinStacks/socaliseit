import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Custom rules
  {
    rules: {
      // Allow underscore-prefixed unused variables (common pattern for intentionally unused params)
      "@typescript-eslint/no-unused-vars": ["warn", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_"
      }],
      // Downgrade to warn - API responses from external platforms often use any
      "@typescript-eslint/no-explicit-any": "warn",
      // Allow empty object types (useful for extensible interfaces)
      "@typescript-eslint/no-empty-object-type": "off",
      // Downgrade unescaped entities to warn (low priority)
      "react/no-unescaped-entities": "warn",
      // Downgrade React Compiler-specific rules to warn (require refactoring)
      "react-hooks/immutability": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/use-memo": "warn",
    },
  },
]);

export default eslintConfig;
