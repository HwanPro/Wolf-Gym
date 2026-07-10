import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      ".claude/**",
      ".next/**",
      ".vs/**",
      "biometric-service/bin/**",
      "biometric-service/obj/**",
      "coverage/**",
      "dist/**",
      "logs/**",
      "node_modules/**",
      "playwright-report/**",
      "python-services/**/__pycache__/**",
      "setup-launcher/**",
      "test-results/**",
      "tsconfig.tsbuildinfo",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "react/no-unescaped-entities": "warn",
    },
  },
  {
    files: ["next-env.d.ts", "*.config.*", "prisma/**/*.js", "prisma/**/*.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/triple-slash-reference": "off",
    },
  },
];

export default eslintConfig;
