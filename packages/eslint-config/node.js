// Node.js services (NestJS API, scripts). Enables type-aware rules.
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import { base } from './base.js';

/** @param {string} tsconfigRootDir */
export function nodeConfig(tsconfigRootDir) {
  return tseslint.config(
    ...base,
    {
      languageOptions: {
        globals: { ...globals.node },
        parserOptions: {
          projectService: { allowDefaultProject: ['*.js', '*.mjs', 'scripts/*.mjs'] },
          tsconfigRootDir,
        },
      },
      rules: {
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/no-misused-promises': 'error',
        '@typescript-eslint/require-await': 'off',
        // NestJS DI relies on runtime class references emitted by decorators;
        // converting them to type-only imports breaks injection.
        '@typescript-eslint/consistent-type-imports': 'off',
      },
    },
    { files: ['scripts/**'], rules: { 'no-console': 'off' } },
    prettier,
  );
}
