// Lint for pi-extension's TypeScript: a few rules that catch bugs the type checker cannot, each one an error.
import tseslint from "typescript-eslint";

export default tseslint.config({
  files: ["pi-extension/src/**/*.ts"],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { project: "pi-extension/tsconfig.json", tsconfigRootDir: import.meta.dirname },
  },
  plugins: { "@typescript-eslint": tseslint.plugin },
  rules: {
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-misused-promises": "error",
    "@typescript-eslint/await-thenable": "error",
  },
});
