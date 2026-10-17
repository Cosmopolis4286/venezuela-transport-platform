import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import { ignores, prettier, sharedRules } from '@vtp/eslint-config/base';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  ignores,
  ...sharedRules,
  prettier,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);
