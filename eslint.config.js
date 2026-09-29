import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/release/**", "**/test-results/**", "docs/**", "reference/**", "design/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      // Client data must never reach logs (§10.3): console use is limited to the launcher and scripts.
      "no-console": "error",
    },
  },
  {
    files: ["apps/desktop/src/renderer/**"],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ["apps/desktop/src/main/**", "scripts/**", "**/*.config.*", "apps/desktop/build.mjs"],
    rules: { "no-console": "off" },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs" },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
