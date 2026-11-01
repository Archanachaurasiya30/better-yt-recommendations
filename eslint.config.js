import js from "@eslint/js";
import sonarjs from "eslint-plugin-sonarjs";
import globals from "globals";

export default [
  { ignores: ["src/vendor/", "dist/", "coverage/"] },
  js.configs.recommended,
  sonarjs.configs.recommended,
  {
    rules: {
      "sonarjs/cognitive-complexity": ["error", 10],
    },
  },
  {
    // Extension scripts are classic scripts that share globalThis.BetterYT.
    files: ["src/**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: { ...globals.browser, chrome: "readonly" },
    },
  },
  {
    files: ["src/background.js"],
    languageOptions: {
      globals: { ...globals.serviceworker, chrome: "readonly" },
    },
  },
  {
    files: ["test/**/*.js", "scripts/**/*.js", "eslint.config.js"],
    languageOptions: {
      sourceType: "module",
      globals: globals.node,
    },
  },
  {
    files: ["test/**/*.js"],
    rules: {
      // Tests run the extension's scripts in vm contexts on purpose.
      "sonarjs/code-eval": "off",
    },
  },
];
