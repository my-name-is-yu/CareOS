import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";

export default [
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mts,cts,js,cjs,mjs}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        File: "readonly",
        FormData: "readonly",
        process: "readonly",
        window: "readonly",
        navigator: "readonly",
        document: "readonly",
        console: "readonly",
        Buffer: "readonly",
        Request: "readonly",
        Response: "readonly",
        Event: "readonly",
        performance: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        HTMLCanvasElement: "readonly",
        WebGL2RenderingContext: "readonly",
        WebGLProgram: "readonly",
        WebGLShader: "readonly",
        WebGLTexture: "readonly",
        WebGLVertexArrayObject: "readonly",
        WebGLUniformLocation: "readonly"
      }
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off"
    }
  },
  {
    ignores: [".next/**", "node_modules/**", "dist/**", "coverage/**"]
  }
];
