// Framework-agnostic rules shared by every TypeScript package.
// Apps with a framework preset (Next.js, Expo) compose `ignores` + `sharedRules`
// on top of that preset instead of using `base`, which already bundles typescript-eslint.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export const ignores = {
  ignores: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
    '**/.turbo/**',
    '**/.next/**',
    '**/.expo/**',
  ],
};

export const sharedRules = [
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // Scoped to TS files: some framework presets only register the plugin for them.
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];

/** Plain TypeScript code with no framework preset. */
export const base = tseslint.config(
  ignores,
  js.configs.recommended,
  tseslint.configs.recommended,
  ...sharedRules,
);

/** Disables formatting rules that conflict with Prettier; keep it last. */
export { prettier };

export default [...base, prettier];
