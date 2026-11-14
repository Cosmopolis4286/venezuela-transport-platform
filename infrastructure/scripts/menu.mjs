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
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { delimiter, dirname, join } from 'node:path';
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

// --- Node 24, pnpm and Docker: installed or started when missing --------------------------------

/** Node the project needs: 24.15 or newer, below 25 (see package.json "engines"). */
const nodeFits = (version) => {
  const [major, minor] = version.replace(/^v/, '').split('.').map(Number);
  return major === 24 && minor >= 15;
};

const TOOLS = join(ROOT, '.tools');
const nodeArch = process.arch === 'arm64' ? 'arm64' : 'x64';
const nodeOs = WINDOWS ? 'win' : process.platform === 'darwin' ? 'darwin' : 'linux';
/** Where `node` (and corepack) live inside an extracted Node folder. */
const nodeBin = (dir) => (WINDOWS ? dir : join(dir, 'bin'));

function usePath(dir) {
  process.env.PATH = `${dir}${delimiter}${process.env.PATH ?? ''}`;
}

/** A Node 24 already downloaded into .tools/, newest first. */
function localNode() {
  if (!existsSync(TOOLS)) return null;
  const found = readdirSync(TOOLS)
    .filter((name) => name.startsWith(`node-v24.`) && name.endsWith(`-${nodeOs}-${nodeArch}`))
    .filter((name) => nodeFits(name.split('-')[1]))
    .sort()
    .reverse();
  return found.length ? join(TOOLS, found[0]) : null;
}

async function download(url, file) {
  await retry(
    `Descargar ${url.split('/').pop()}`,
    async () => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(300_000) });
        if (!res.ok) return false;
        writeFileSync(file, Buffer.from(await res.arrayBuffer()));
        return true;
      } catch {
        return false;
      }
    },
    { hint: 'Revisa tu conexión a internet (o el proxy) y repite.' },
  );
}

/**
 * Makes Node 24 the `node` of every command the menu runs. With another version installed, it
 * downloads the official Node 24 into .tools/ (checked against nodejs.org's SHA-256 list), only
 * for this project: the computer's Node is not touched and no administrator rights are needed.
 */
async function ensureNode() {
  if (nodeFits(process.versions.node) && nodeFits(output('node', ['-v']) ?? '')) {
    ok(`Node ${process.versions.node}`);
    return true;
  }
  let dir = localNode();
  if (!dir) {
    warn(
      `Tienes Node ${output('node', ['-v']) ?? process.versions.node}; el proyecto usa Node 24. ` +
        'Lo descargo solo para este proyecto (carpeta .tools/, no cambia tu instalación)…',
    );
    let version;
    try {
      const index = await (await fetch('https://nodejs.org/dist/index.json')).json();
      version = index.find((r) => r.version.startsWith('v24.'))?.version;
    } catch {
      version = undefined;
    }
    version ??= 'v24.15.0';
    const name = `node-${version}-${nodeOs}-${nodeArch}`;
    const archive = `${name}.${WINDOWS ? 'zip' : 'tar.gz'}`;
    const base = `https://nodejs.org/dist/${version}`;
    mkdirSync(TOOLS, { recursive: true });
    const file = join(TOOLS, archive);
    await download(`${base}/${archive}`, file);
    // Integrity: the archive must match the checksum nodejs.org publishes.
    const sums = await (await fetch(`${base}/SHASUMS256.txt`)).text().catch(() => '');
    const expected = sums
      .split('\n')
      .find((line) => line.endsWith(`  ${archive}`))
      ?.split(' ')[0];
    const actual = createHash('sha256').update(readFileSync(file)).digest('hex');
    if (!expected || expected !== actual) {
      rmSync(file, { force: true });
      throw new StepError('La descarga de Node no coincide con la suma de nodejs.org.', 'Repite.');
    }
    // tar comes with Windows 10+, macOS and Linux, and also opens .zip on Windows.
    const extracted =
      run('tar', [WINDOWS ? '-xf' : '-xzf', file, '-C', TOOLS], { quiet: true }) ||
      (WINDOWS &&
        run(
          'powershell',
          ['-NoProfile', '-Command', `Expand-Archive -Force '${file}' '${TOOLS}'`],
          { quiet: true },
        ));
    rmSync(file, { force: true });
    if (!extracted) throw new StepError('No se pudo descomprimir Node.');
    dir = join(TOOLS, name);
  }
  usePath(nodeBin(dir));
  const version = output('node', ['-v']);
  if (!version || !nodeFits(version)) {
    throw new StepError(`No se pudo usar el Node 24 de ${dir}.`, 'Prueba la opción "Reparar".');
  }
  ok(`Node ${version} (del proyecto, en .tools/)`);
  return true;
}

/** pnpm in the version of package.json "packageManager", through corepack (comes with Node). */
function ensurePnpm() {
  process.env.COREPACK_ENABLE_DOWNLOAD_PROMPT = '0';
  // A pnpm installed with another Node may start with that Node (its shim points to it): with the
  // project's own Node, put a pnpm shim right next to it, first in PATH.
  const nodeDir = dirname(output('node', ['-p', 'process.execPath']) ?? '');
  const ownNode = nodeDir.startsWith(TOOLS);
  const shim = join(nodeDir, WINDOWS ? 'pnpm.cmd' : 'pnpm');
  if (ownNode && !existsSync(shim)) {
    run('corepack', ['enable', 'pnpm', '--install-directory', nodeDir], { quiet: true });
  }
  let version = output('pnpm', ['--version']);
  if (!version) {
    warn('Activo pnpm con corepack…');
    run('corepack', ['enable', 'pnpm'], { quiet: true });
    version = output('pnpm', ['--version']);
  }
  if (version) return (ok(`pnpm ${version}`), true);
  fail('pnpm no está disponible ni con corepack.');
  console.log(dim('  Prueba "npm install -g pnpm@10" y vuelve a abrir el menú.'));
  return false;
}

/** Docker Desktop's program on Windows, if installed. */
function dockerDesktopExe() {
  for (const base of [process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean)) {
    const exe = join(base, 'Docker', 'Docker', 'Docker Desktop.exe');
    if (existsSync(exe)) return exe;
  }
  return null;
}

/** Offers to install Docker when it is missing (it needs the user's consent and a restart). */
async function installDocker() {
  const yes = async (question) => /^s/i.test((await ask(`${question} (s/n): `)).trim());
  if (WINDOWS && output('winget', ['--version'])) {
    if (!(await yes('Docker Desktop no está instalado. ¿Lo instalo ahora con winget?'))) return;
    const done = run('winget', [
      'install',
      '-e',
      '--id',
      'Docker.DockerDesktop',
      '--accept-package-agreements',
      '--accept-source-agreements',
    ]);
    if (done) {
      warn(
        'Docker Desktop quedó instalado. Windows puede pedir reiniciar; después ábrelo una vez ' +
          '(acepta sus términos y WSL 2) y vuelve a abrir este menú.',
      );
    }
    return;
  }
  if (process.platform === 'darwin' && output('brew', ['--version'])) {
    if (await yes('Docker Desktop no está instalado. ¿Lo instalo con Homebrew?')) {
      run('brew', ['install', '--cask', 'docker']);
      run('open', ['-a', 'Docker']);
    }
    return;
  }
  if (process.platform === 'linux') {
    if (await yes('Docker no está instalado. ¿Lo instalo con el script oficial (pide sudo)?')) {
      run('sh', ['-c', 'curl -fsSL https://get.docker.com | sudo sh']);
      run('sudo', ['usermod', '-aG', 'docker', process.env.USER ?? '']);
      warn('Cierra sesión y vuelve a entrar para usar Docker sin sudo.');
    }
    return;
  }
  console.log(dim('  Instálalo desde https://docs.docker.com/get-docker/'));
}

/** Starts Docker when it is installed but not running. */
function startDocker() {
  const exe = WINDOWS ? dockerDesktopExe() : null;
  if (exe) {
    spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
    return warn('Abrí Docker Desktop; espero a que arranque (puede tardar un par de minutos)…');
  }
  if (process.platform === 'darwin') {
    run('open', ['-a', 'Docker'], { quiet: true });
    return warn('Abrí Docker Desktop; espero a que arranque…');
  }
  if (process.platform === 'linux') {
    run('sudo', ['-n', 'systemctl', 'start', 'docker'], { quiet: true });
    return warn('Intento arrancar Docker (systemctl); espero…');
  }
}

async function dockerOk({ wait = true } = {}) {
  if (!output('docker', ['--version'])) {
    fail('Docker no está instalado.');
    if (wait) await installDocker();
    if (!output('docker', ['--version'])) return false;
  }
  if (!output('docker', ['compose', 'version'])) {
    fail('Falta Docker Compose v2 (el plugin "docker compose").');
    return false;
  }
  for (let i = 0; i < (wait ? 90 : 1); i++) {
    if (output('docker', ['info', '--format', '{{.ServerVersion}}'])) {
      ok('Docker está corriendo');
      return true;
    }
    // Not running: start it once, then wait up to 3 minutes (Docker Desktop is slow to start).
    if (i === 0 && wait) startDocker();
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
  const okNode = await ensureNode();
  const okPnpm = okNode && ensurePnpm();
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
  const local = localNode();
  const system = output('node', ['-v']) ?? process.versions.node;
  if (nodeFits(system)) ok(`Node ${system}`);
  else if (local) ok(`Node del proyecto en ${local} (tu Node ${system} no se usa)`);
  else warn(`Node ${system}: "Preparar todo" descarga Node 24 para el proyecto`);
  const pnpm = output('pnpm', ['--version']);
  pnpm ? ok(`pnpm ${pnpm}`) : warn('pnpm no activo: "Preparar todo" lo activa');
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
