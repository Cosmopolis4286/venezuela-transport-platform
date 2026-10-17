// Stops local containers and DELETES their named volumes (PostgreSQL and Redis data).
// This cannot be undone. Requires typing the project name, or --yes for automation.
// Usage: pnpm infra:reset [-- --yes]
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

const confirmed = process.argv.includes('--yes');

if (!confirmed) {
  console.warn(
    '\nWARNING: this permanently deletes ALL local database and Redis data for project "vtp"\n' +
      '(Docker volumes vtp_postgres-data and vtp_redis-data). Back up anything you need first:\n' +
      '  docker compose exec postgres sh -c \'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"\' > backup.dump\n',
  );
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Type "vtp" to confirm: ');
  rl.close();
  if (answer.trim() !== 'vtp') {
    console.log('Aborted. Nothing was deleted.');
    process.exit(1);
  }
}

const result = spawnSync('docker', ['compose', '--profile', 'redis', 'down', '--volumes'], {
  stdio: 'inherit',
});
if (result.status === 0) console.log('\nLocal data removed. Run "pnpm infra:up" to start fresh.');
process.exit(result.status ?? 1);
