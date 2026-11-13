// Interactive menu to install, run and check the platform locally. No dependencies: it runs with
// plain Node before `pnpm install`. Each step checks what it needs first, retries what can fail
// for a moment (Docker starting, the database waking up, the network) and says how to fix the
// rest. Every option can also run without the menu:
//
//   node infrastructure/scripts/menu.mjs            # menu
//   node infrastructure/scripts/menu.mjs setup      # or: pnpm menu setup
//   … setup | dev | passenger | transport | all | seed | admin <email> | status | check | e2e
//     | repair | reset
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WINDOWS = process.platform === 'win32';
const API_HEALTH = 'http://localhost:4000/api/v1/health';
const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (text) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);
const bold = paint(1);
const green = paint(32);
const red = paint(31);
const yellow = paint(33);
const dim = paint(2);

const ok = (msg) => console.log(`${green('✔')} ${msg}`);
const warn = (msg) => console.log(`${yellow('!')} ${msg}`);
const fail = (msg) => console.log(`${red('✖')} ${msg}`);
const step = (msg) => console.log(`\n${bold('▶ ' + msg)}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Stops a step with a message the user can act on (the menu keeps running). */
class StepError extends Error {
  constructor(message, hint) {
    super(message);
    this.hint = hint;
  }
}

/** Runs a command in the repo, showing its output. Returns true when it exits with 0. */
function run(command, args, { cwd = ROOT, quiet = false, env } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: quiet ? 'pipe' : 'inherit',
    shell: WINDOWS,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  if (result.error) return false;
  return result.status === 0;
}

/** Output of a command, or null when it fails or does not exist. */
function output(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, shell: WINDOWS, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

/** Retries `attempt` with a growing wait; throws the last error with `hint`. */
async function retry(label, attempt, { tries = 4, waitMs = 2000, hint } = {}) {
  for (let i = 1; i <= tries; i++) {
    if (await attempt()) return;
    if (i < tries) {
      warn(`${label} falló (intento ${i} de ${tries}); reintento en ${(waitMs * i) / 1000} s…`);
      await sleep(waitMs * i);
    }
  }
  throw new StepError(`${label} no funcionó después de ${tries} intentos.`, hint);
}

// --- Checks ---------------------------------------------------------------------------------

function nodeOk() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major === 24 && minor >= 15) return (ok(`Node ${process.versions.node}`), true);
  fail(`Node ${process.versions.node}: hace falta Node 24.15 o más nuevo (y menor que 25).`);
  console.log(dim('  Instálalo con fnm o nvm: fnm install 24 && fnm use 24'));
  return false;
}

/**
 * Re-enters this script with the repository's supported Node major when a version manager
 * is available. A child process cannot change its parent PowerShell/terminal environment,
 * but fnm exec (or nvm use on Windows) guarantees this menu and all its child commands use it.
 */
function ensureNodeRuntime() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major === 24 && minor >= 15) return true;
  if (process.env.VTP_NODE_BOOTSTRAPPED === '1') {
    fail(
      `Node ${process.versions.node} sigue fuera del rango requerido después del cambio automático.`,
    );
    return false;
  }

  const script = fileURLToPath(import.meta.url);
  const forwardedArgs = process.argv.slice(2);
  const env = { ...process.env, VTP_NODE_BOOTSTRAPPED: '1' };
  const runManager = (manager, args) =>
    spawnSync(manager, args, { cwd: ROOT, stdio: 'inherit', env, windowsHide: true });

  // fnm keeps the selected version scoped to the re-launched process tree.
  if (spawnSync('fnm', ['--version'], { encoding: 'utf8', windowsHide: true }).status === 0) {
    step('Node incompatible: preparando automáticamente Node 24 con fnm');
    const installed = runManager('fnm', ['install', '24']);
    if (installed.error || installed.status !== 0) {
      fail('No se pudo instalar Node 24 con fnm. Comprueba tu conexión y vuelve a intentarlo.');
      return false;
    }
    const relaunched = runManager('fnm', [
      'exec', '--using', '24', 'node', script, ...forwardedArgs,
    ]);
    if (relaunched.error) {
      fail(`No se pudo reiniciar el menú con Node 24: ${relaunched.error.message}`);
    }
    process.exit(relaunched.status ?? 1);
  }

  // nvm-windows changes its Node symlink globally; the re-launched process picks it up.
  if (
    WINDOWS && spawnSync('nvm', ['version'], { encoding: 'utf8', windowsHide: true }).status === 0
  ) {
    step('Node incompatible: preparando automáticamente Node 24 con nvm-windows');
    const installed = runManager('nvm', ['install', '24.15.0']);
    if (installed.error || installed.status !== 0) {
      fail(
        'No se pudo instalar Node 24 con nvm-windows. Ejecuta PowerShell como administrador si lo solicita.',
      );
      return false;
    }
    const selected = runManager('nvm', ['use', '24.15.0']);
    if (selected.error || selected.status !== 0) {
      fail(
        'No se pudo activar Node 24.15.0 con nvm-windows. Comprueba los permisos de NVM_SYMLINK.',
      );
      return false;
    }
    const relaunched = runManager('node', [script, ...forwardedArgs]);
    if (relaunched.error) {
      fail(`No se pudo reiniciar el menú con Node 24: ${relaunched.error.message}`);
    }
    process.exit(relaunched.status ?? 1);
  }

  fail(
    `Node ${process.versions.node}: el proyecto requiere Node 24.15 o más nuevo (y menor que 25).`,
  );
  console.log(
    dim(
      '  Para automatizar el cambio, instala fnm (recomendado) o nvm-windows y vuelve a ejecutar el menú.',
    ),
  );
  return false;
}

function pnpmOk() {
  let version = output('pnpm', ['--version']);
  if (!version) {
    warn('pnpm no está activo; lo activo con corepack…');
    run('corepack', ['enable'], { quiet: true });
    version = output('pnpm', ['--version']);
  }
  if (version) return (ok(`pnpm ${version}`), true);
  fail(
    'pnpm no está disponible. Ejecuta "corepack enable" (con permisos de administrador si hace falta).',
  );
  return false;
}

async function dockerOk({ wait = true } = {}) {
  if (!output('docker', ['--version'])) {
    fail('Docker no está instalado: https://docs.docker.com/get-docker/');
    return false;
  }
  if (!output('docker', ['compose', 'version'])) {
    fail('Falta Docker Compose v2 (el plugin "docker compose").');
    return false;
  }
  for (let i = 0; i < (wait ? 15 : 1); i++) {
    if (output('docker', ['info', '--format', '{{.ServerVersion}}'])) {
      ok('Docker está corriendo');
      return true;
    }
    if (i === 0 && wait)
      warn('Docker no responde todavía; espero hasta 30 s (¿abriste Docker Desktop?)…');
    await sleep(2000);
  }
  fail('Docker no está corriendo. Abre Docker Desktop (o "sudo systemctl start docker") y repite.');
  return false;
}

/** True when nothing listens on `port` (so a new server can use it). */
function portFree(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

async function apiUp() {
  try {
    const res = await fetch(API_HEALTH, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function preflight({ docker = true } = {}) {
  step('Revisando lo necesario');
  const okNode = nodeOk();
  const okPnpm = pnpmOk();
  const okDocker = docker ? await dockerOk() : true;
  if (!okNode || !okPnpm || !okDocker) {
    throw new StepError('Falta algo para continuar (mira los ✖ de arriba).');
  }
}

// --- Steps ----------------------------------------------------------------------------------

async function install() {
  step('Instalando dependencias');
  const lock = ['install', '--frozen-lockfile'];
  await retry('pnpm install', () => run('pnpm', lock), {
    hint: 'Revisa tu conexión a internet. Si sigue fallando, prueba la opción "Reparar".',
  });
}

function envFiles() {
  step('Archivos de configuración (.env)');
  if (!run('node', ['infrastructure/scripts/init-env.mjs'])) {
    throw new StepError('No se pudieron crear los archivos .env.');
  }
}

async function database() {
  step('Base de datos (PostgreSQL + PostGIS en Docker)');
  if (!(await dockerOk())) throw new StepError('Docker no está disponible.');
  // The root .env is not a reliable proxy for the app-specific files: users may have
  // created only some of them. init-env is safe to run repeatedly and never overwrites.
  envFiles();
  await retry('Arrancar la base de datos', () => run('pnpm', ['infra:up']), {
    hint: 'Si el puerto 5432 está ocupado por otro PostgreSQL, deténlo o cambia POSTGRES_PORT en .env.',
  });
  await retry('Aplicar las migraciones', () => run('pnpm', ['db:migrate']), {
    tries: 5,
    hint: 'Si cambiaste la contraseña, debe coincidir en .env y apps/api/.env. "pnpm db:check" da detalles.',
  });
  ok('Base de datos lista y al día');
}

async function setup() {
  await preflight();
  await install();
  await database();
  step('Listo');
  console.log(
    'Siguiente: "Arrancar API y web" y, si quieres datos de prueba, "Cargar datos de ejemplo".',
  );
}

async function warnBusyPorts(ports) {
  for (const [port, what] of ports) {
    if (!(await portFree(port)))
      warn(`El puerto ${port} (${what}) ya está en uso: ¿ya lo tienes abierto?`);
  }
}

/** Long-running servers: they take over the terminal until Ctrl+C. */
async function serve(label, script, ports) {
  await preflight();
  if (!existsSync(join(ROOT, 'node_modules'))) await install();
  await database();
  await warnBusyPorts(ports);
  step(`${label} (Ctrl+C para detener y volver al menú)`);
  // The server owns the terminal meanwhile (and Ctrl+C reaches it): release the menu's input.
  releaseInput();
  await new Promise((resolve, reject) => {
    const child = spawn('pnpm', [script], { cwd: ROOT, stdio: 'inherit', shell: WINDOWS });
    const stop = () => child.kill('SIGINT');
    process.once('SIGINT', stop);
    let spawnError;
    child.once('error', (error) => {
      spawnError = error;
    });
    child.once('close', (code, signal) => {
      process.removeListener('SIGINT', stop);
      if (spawnError) {
        reject(new StepError(`No se pudo iniciar ${script}: ${spawnError.message}`));
        return;
      }
      if (signal && signal !== 'SIGINT') {
        reject(new StepError(`${script} terminó por la señal ${signal}.`));
        return;
      }
      if (code !== 0) {
        reject(new StepError(`${script} terminó con código ${code ?? 'desconocido'}.`));
        return;
      }
      resolve();
    });
  });
}

/** Runs `work` with the API up: uses a running one or starts one just for it. */
async function withApi(work) {
  if (await apiUp()) return work();
  step('La API no está corriendo: la arranco solo para esto');
  await retry('Compilar la API', () => run('pnpm', ['--filter', '@vtp/api', 'build']), {
    tries: 2,
  });
  const api = spawn('node', ['--env-file-if-exists=.env', 'dist/main.js'], {
    cwd: join(ROOT, 'apps', 'api'),
    stdio: ['ignore', 'ignore', 'pipe'],
    shell: false,
  });
  let errors = '';
  let startupError;
  api.stderr.on('data', (chunk) => (errors += chunk));
  api.once('error', (error) => {
    startupError = error;
  });
  try {
    for (let i = 0; i < 60 && !(await apiUp()); i++) {
      if (startupError) {
        throw new StepError(`No se pudo iniciar la API: ${startupError.message}`);
      }
      if (api.exitCode !== null) {
        throw new StepError(`La API se detuvo al arrancar:\n${errors.slice(-800)}`);
      }
      await sleep(1000);
    }
    if (startupError) throw new StepError(`No se pudo iniciar la API: ${startupError.message}`);
    if (!(await apiUp())) throw new StepError('La API no respondió en 60 s.');
    await work();
  } finally {
    if (api.exitCode === null) api.kill();
  }
}

async function seed() {
  await preflight();
  await database();
  await withApi(async () => {
    step('Cargando datos de ejemplo del suburbano');
    if (!run('node', ['infrastructure/scripts/seed-suburban.mjs'])) {
      throw new StepError('La carga de datos de ejemplo falló (mira el mensaje de arriba).');
    }
  });
}

async function admin(email) {
  await preflight();
  await database();
  const address =
    email ?? (await ask('Correo de la cuenta (ya registrada) que será administradora: '));
  const normalizedEmail = address.trim();
  // `run()` uses the Windows shell for pnpm.cmd; accept a conservative email shape so
  // shell metacharacters cannot become additional commands.
  if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(normalizedEmail)) {
    throw new StepError('Ese no parece un correo válido.');
  }
  step(`Dando el rol de administrador a ${normalizedEmail}`);
  if (!run('pnpm', ['platform:grant', '--email', normalizedEmail, '--role', 'admin'])) {
    throw new StepError(
      'No se pudo dar el rol.',
      'La cuenta debe existir: regístrate primero en la web o la app.',
    );
  }
}

async function status() {
  step('Estado');
  nodeOk();
  pnpmOk();
  if (await dockerOk({ wait: false })) {
    const ps = output('docker', ['compose', 'ps', '--format', '{{.Service}}: {{.State}}']);
    console.log(ps ? dim(ps) : dim('  (no hay contenedores del proyecto)'));
    run('pnpm', ['db:check']);
  }
  (await apiUp()) ? ok('API en http://localhost:4000') : warn('API apagada');
  for (const [port, what] of [
    [3000, 'web'],
    [8081, 'app de pasajeros'],
    [8082, 'app de transportistas'],
  ]) {
    (await portFree(port))
      ? warn(`${what} apagada (:${port})`)
      : ok(`${what} en http://localhost:${port}`);
  }
}

async function check() {
  await preflight({ docker: false });
  step('Verificando el código (lint, tipos y pruebas)');
  if (!run('pnpm', ['check'])) throw new StepError('Hay errores (mira arriba).');
}

async function e2e() {
  await preflight();
  await database();
  step('Pruebas e2e de la API contra la base local');
  if (!run('pnpm', ['test:e2e'], { env: { E2E_EXPECT_DATABASE: 'true' } })) {
    throw new StepError('Alguna prueba e2e falló (mira arriba).');
  }
}

async function repair() {
  step('Reparando: borro cachés de compilación y reinstalo');
  for (const dir of [
    '.turbo',
    'apps/web/.next',
    'apps/passenger-mobile/.expo',
    'apps/transport-mobile/.expo',
    'packages/shared-types/dist',
    'apps/api/dist',
  ]) {
    rmSync(join(ROOT, dir), { recursive: true, force: true });
  }
  ok('Cachés borradas');
  await preflight({ docker: false });
  await install();
  if (!run('pnpm', ['--filter', '@vtp/shared-types', 'build'])) {
    throw new StepError('No se pudo compilar @vtp/shared-types.');
  }
  ok('Reinstalado. Si una app móvil sigue rara, arráncala con --clear.');
}

async function reset() {
  const answer = await ask(
    red(
      'Esto BORRA todos los datos locales (base de datos y Redis). Escribe "vtp" para confirmar: ',
    ),
  );
  if (answer.trim() !== 'vtp') return warn('Cancelado: no se borró nada.');
  if (!run('node', ['infrastructure/scripts/reset-local-data.mjs', '--yes'])) {
    throw new StepError('No se pudieron borrar los datos.');
  }
  await database();
}

// --- Menu -----------------------------------------------------------------------------------

// Lines are queued as they arrive, so answers typed (or piped) ahead of time are not lost. When
// the input closes, every pending and later question gets "0" (exit).
let rl;
const lines = [];
const waiting = [];
let inputClosed = false;
let releasing = false;
function releaseInput() {
  if (!rl) return;
  // Keep the flag set until the close event fires; readline may emit it asynchronously.
  releasing = true;
  rl.close();
}
function ask(question) {
  if (!rl) {
    rl = createInterface({ input: process.stdin, terminal: process.stdin.isTTY });
    rl.on('line', (line) => (waiting.length ? waiting.shift()(line) : lines.push(line)));
    rl.on('close', () => {
      rl = undefined;
      if (releasing) {
        releasing = false;
        return;
      }
      inputClosed = true;
      while (waiting.length) waiting.shift()('0');
    });
  }
  process.stdout.write(question);
  if (lines.length) return Promise.resolve(lines.shift());
  if (inputClosed) return Promise.resolve('0');
  return new Promise((resolve) => waiting.push(resolve));
}

const OPTIONS = [
  ['setup', 'Preparar todo (primera vez: dependencias, .env, base de datos)', setup],
  [
    'dev',
    'Arrancar API y web (http://localhost:3000)',
    () =>
      serve('API y web', 'dev', [
        [3000, 'web'],
        [4000, 'API'],
      ]),
  ],
  [
    'passenger',
    'Arrancar la app de pasajeros (Expo, :8081)',
    () => serve('App de pasajeros', 'dev:passenger', [[8081, 'Metro']]),
  ],
  [
    'transport',
    'Arrancar la app de transportistas (Expo, :8082)',
    () => serve('App de transportistas', 'dev:transport', [[8082, 'Metro']]),
  ],
  [
    'all',
    'Arrancar todo junto (API, web y las dos apps)',
    () =>
      serve('Todo', 'dev:all', [
        [3000, 'web'],
        [4000, 'API'],
        [8081, 'Metro'],
        [8082, 'Metro'],
      ]),
  ],
  ['seed', 'Cargar datos de ejemplo del suburbano (zona, rutas, motos, paquetes)', seed],
  ['admin', 'Hacer administradora una cuenta', () => admin()],
  ['status', 'Ver el estado (Docker, base de datos, servidores)', status],
  ['check', 'Verificar el código (pnpm check)', check],
  ['e2e', 'Pruebas e2e de la API', e2e],
  ['repair', 'Reparar (borrar cachés y reinstalar)', repair],
  ['reset', 'Borrar los datos locales y empezar de cero', reset],
];

async function runOption(name, extra) {
  const option = OPTIONS.find(([key]) => key === name);
  if (!option) {
    fail(`Opción desconocida: ${name}. Opciones: ${OPTIONS.map(([key]) => key).join(', ')}`);
    return false;
  }
  try {
    await (name === 'admin' && extra ? admin(extra) : option[2]());
    return true;
  } catch (error) {
    fail(error.message);
    if (error.hint) console.log(dim(`  ${error.hint}`));
    return false;
  }
}

async function menu() {
  for (;;) {
    console.log(`\n${bold('VTP · menú local')} ${dim(`(${ROOT})`)}`);
    OPTIONS.forEach(([, label], i) => console.log(`  ${String(i + 1).padStart(2)}. ${label}`));
    console.log('   0. Salir');
    const answer = (await ask('\nElige una opción: ')).trim();
    if (answer === '0' || answer.toLowerCase() === 'q') break;
    const option = OPTIONS[Number(answer) - 1] ?? OPTIONS.find(([key]) => key === answer);
    if (!option) {
      warn('Opción no válida.');
      continue;
    }
    await runOption(option[0]);
  }
  releaseInput();
}

if (!ensureNodeRuntime()) process.exit(1);

const [command, extra] = process.argv.slice(2);
if (command) {
  const done = await runOption(command, extra);
  releaseInput();
  process.exit(done ? 0 : 1);
} else {
  if (
    !existsSync(join(ROOT, 'package.json')) ||
    !readFileSync(join(ROOT, 'package.json'), 'utf8').includes('"name"')
  ) {
    fail('No encuentro el repositorio.');
    process.exit(1);
  }
  await menu();
}
