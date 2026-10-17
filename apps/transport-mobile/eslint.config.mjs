import { defineConfig } from 'eslint/config';
import expoConfig from 'eslint-config-expo/flat.js';
import { ignores, prettier, sharedRules } from '@vtp/eslint-config/base';

export default defineConfig([
  expoConfig,
  ignores,
  ...sharedRules,
  prettier,
  { ignores: ['dist/*', '.expo/*', 'metro.config.js'] },
]);
