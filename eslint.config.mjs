import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import reactHooks from "eslint-plugin-react-hooks";

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
    // Storybook/Percy were removed from devDependencies during the CI cleanup —
    // these files no longer have a toolchain to parse or run them. Delete the
    // ignores (and restore the deps) if visual regression testing comes back.
    ".storybook/**",
    "src/stories/**",
    "scripts/capture-visual-regression.js",
  ]),
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/set-state-in-effect": "error",
    },
  },
]);

export default eslintConfig;
