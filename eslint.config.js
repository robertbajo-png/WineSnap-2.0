import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi", "src/integrations/supabase/previewAuthStorage.ts"] },
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
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Shared primitives, the i18n provider and the router factory intentionally
    // export helpers alongside components; Fast Refresh granularity is not a concern there.
    files: [
      "src/components/ui/**/*.tsx",
      "src/components/AromaChip.tsx",
      "src/components/AromaIcon.tsx",
      "src/i18n/**/*.tsx",
      "src/router.tsx",
    ],
    rules: { "react-refresh/only-export-components": "off" },
  },
  eslintPluginPrettier,
);

