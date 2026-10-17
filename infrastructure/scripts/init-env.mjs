// Creates local env files from their committed templates. Never overwrites an existing file.
// Usage: pnpm env:init
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const targets = [
  ['.env.example', '.env'],
  ['apps/api/.env.example', 'apps/api/.env'],
  ['apps/web/.env.example', 'apps/web/.env.local'],
  ['apps/passenger-mobile/.env.example', 'apps/passenger-mobile/.env'],
  ['apps/transport-mobile/.env.example', 'apps/transport-mobile/.env'],
];

for (const [template, target] of targets) {
  const from = join(root, template);
  const to = join(root, target);
  if (existsSync(to)) {
    console.log(`skip    ${relative(root, to)} (already exists)`);
  } else {
    copyFileSync(from, to);
    console.log(`created ${relative(root, to)}`);
  }
}
console.log('\nReview the new files. Values are placeholders suitable for local development only.');
