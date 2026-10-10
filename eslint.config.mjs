import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default tseslint.config(
  { ignores: [".next/**", "node_modules/**", "coverage/**", "playwright-report/**", "test-results/**", "next-env.d.ts"] },
  { files: ["**/*.{ts,tsx}"], extends: [js.configs.recommended, ...tseslint.configs.recommended] },
  { files: ["src/**/*.{ts,tsx}"], plugins: { "react-hooks": reactHooks, "jsx-a11y": jsxA11y }, rules: {
    ...reactHooks.configs.recommended.rules,
    ...jsxA11y.configs.recommended.rules
  } }
);
