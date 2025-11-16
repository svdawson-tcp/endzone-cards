import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import tailwindcss from "eslint-plugin-tailwindcss";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "tailwindcss": tailwindcss,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      
      // Tailwind CSS linting
      "tailwindcss/classnames-order": "warn",
      "tailwindcss/no-custom-classname": "off",
      "tailwindcss/no-contradicting-classname": "error",
      
      // Design System Enforcement - Block hardcoded colors
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/text-gray-/]",
          message: "❌ DESIGN SYSTEM VIOLATION: Use semantic tokens like 'text-card-foreground' or 'text-muted-foreground' instead of text-gray-*"
        },
        {
          selector: "Literal[value=/bg-gray-/]",
          message: "❌ DESIGN SYSTEM VIOLATION: Use semantic tokens like 'bg-card' or 'bg-muted' instead of bg-gray-*"
        },
        {
          selector: "Literal[value=/border-gray-/]",
          message: "❌ DESIGN SYSTEM VIOLATION: Use semantic token 'border-border' instead of border-gray-*"
        },
        {
          selector: "Literal[value=/\\btext-white\\b/]",
          message: "❌ DESIGN SYSTEM VIOLATION: Use semantic token 'text-foreground' or 'text-card-foreground' instead of text-white"
        },
        {
          selector: "Literal[value=/\\btext-black\\b/]",
          message: "❌ DESIGN SYSTEM VIOLATION: Use semantic token 'text-card-foreground' or 'text-foreground' instead of text-black"
        },
        {
          selector: "Literal[value=/\\bbg-white\\b/]",
          message: "❌ DESIGN SYSTEM VIOLATION: Use semantic token 'bg-card' or 'bg-background' instead of bg-white"
        },
        {
          selector: "Literal[value=/\\bbg-black\\b/]",
          message: "❌ DESIGN SYSTEM VIOLATION: Use semantic token 'bg-background' or proper background token instead of bg-black"
        }
      ]
    },
    settings: {
      tailwindcss: {
        callees: ["cn", "cva"],
        config: "tailwind.config.ts"
      }
    }
  },
);
