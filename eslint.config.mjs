import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";

export default [
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mts,cts,js,cjs,mjs}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module"
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off"
    }
  },
  {
    ignores: [".next/**", "node_modules/**", "dist/**", "coverage/**"]
  }
];
