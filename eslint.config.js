import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginVue from "eslint-plugin-vue";
import configPrettier from "eslint-config-prettier";

export default tseslint.config(
  {
    // dist + the CLI's bundled demo build (packages/cli/public) are generated,
    // minified artifacts, not source. (Prettier skips them via .gitignore;
    // ESLint flat config does not read .gitignore, so list them here.)
    ignores: [
      "**/dist/**",
      "packages/cli/public/**",
      "**/node_modules/**",
      "**/*.tsbuildinfo",
      "**/coverage/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs["flat/recommended"],
  {
    // TypeScript inside <script lang="ts"> single-file components
    files: ["**/*.vue"],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      // Node (CLI, configs, bin) + browser (viewer) globals
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // A viewer component library intentionally exports single-word names (Viewer, Toolbar…).
      "vue/multi-word-component-names": "off",
      // Underscore-prefixed args/vars are intentionally unused (e.g. interface-required
      // params a given adapter ignores, like LocalDataSource.getSeries(_studyUids)).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Must be last: turns off formatting rules that conflict with Prettier (Prettier owns format).
  configPrettier,
);
