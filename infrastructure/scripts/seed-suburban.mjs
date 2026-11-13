// Loads SAMPLE data for the suburban service (Casacoima – San Félix – Puerto Ordaz) into a LOCAL
// database, through the API, so everything goes through the same validations as the real app.
// Coordinates, fares, rates and companies are made up: never run this against production.
//
// Usage: node infrastructure/scripts/seed-suburban.mjs [--api http://localhost:4000/api/v1]
// The API must be running (pnpm dev:api) and the database migrated. Safe to run twice: if the
// sample zone already exists it only prints the accounts.
import { spawnSync } from 'node:child_process';

const API = argValue('--api') ?? process.env.VTP_API_URL ?? 'http://localhost:4000/api/v1';
const PASSWORD = 'vtp-demo-2026';
const ZONE_SLUG = 'eje-casacoima-san-felix-puerto-ordaz';
const ACCOUNTS = {
  admin: { email: 'admin@vtp.test', firstName: 'Ana', lastName: 'Administradora' },
  bus: { email: 'empresa@vtp.test', firstName: 'Bruno', lastName: 'Dueño de buses' },
  moto: { email: 'moto@vtp.test', firstName: 'Marta', lastName: 'Dueña de mototaxis' },
  taxi: { email: 'taxi@vtp.test', firstName: 'Tomás', lastName: 'Dueño de taxis' },
  passenger: { email: 'pasajero@vtp.test', firstName: 'Pedro', lastName: 'Pasajero' },
};

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

class ApiError extends Error {
  constructor(status, body, what) {
    super(
      `${what}: HTTP ${status} ${body?.error?.reason ?? body?.error?.code ?? ''} ${body?.error?.message ?? ''}`,
    );
    this.status = status;
    this.reason = body?.error?.reason;
  }
}

/** One API call, retried on network errors (the API may still be starting). */
async function call(method, path, { auth, body, what = `${method} ${path}` } = {}) {
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(API + path, {
        method,
        headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      if (attempt >= 5) throw new Error(`${what}: no answer from ${API} (${error.message})`);
      await new Promise((r) => setTimeout(r, attempt * 1000));
      continue;
    }
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) throw new ApiError(res.status, json, what);
    return json;
  }
}

/** Registers the account, or logs in if it already exists. Returns `Bearer …`. */
async function account(who) {
  const a = ACCOUNTS[who];
  const login = () =>
    call('POST', '/auth/login', {
      body: { email: a.email, password: PASSWORD, client: 'web' },
      what: `entrar como ${a.email}`,
    });
  let res;
  try {
    res = await call('POST', '/auth/register', {
      body: { ...a, password: PASSWORD, client: 'web', acceptTerms: true },
      what: `crear ${a.email}`,
    });
  } catch (error) {
    if (error.status !== 409) throw error;
    res = await login();
  }
  return `Bearer ${res.tokens.accessToken}`;
}

/** Platform role straight in the local database (the same as `pnpm platform:grant`). */
function grantAdmin(email) {
  const sql = `update users set platform_role = 'admin' where email = '${email}'`;
  const r = spawnSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'sh',
      '-c',
      `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "${sql}"`,
    ],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) {
    throw new Error(`No se pudo dar el rol de administrador: ${r.stderr || r.stdout}`.trim());
  }
}

function printAccounts() {
  console.log('\nCuentas de ejemplo (contraseña para todas: ' + PASSWORD + '):');
  console.log('  Administración de la plataforma  ' + ACCOUNTS.admin.email);
  console.log('  Empresa de buses                 ' + ACCOUNTS.bus.email);
  console.log('  Línea de mototaxis               ' + ACCOUNTS.moto.email);
  console.log('  Línea de taxis                   ' + ACCOUNTS.taxi.email);
  console.log('  Pasajero                         ' + ACCOUNTS.passenger.email);
  console.log('\nWeb: http://localhost:3000 · Portal y admin: http://localhost:3000/login');
}

async function main() {
  console.log(`Cargando datos de ejemplo del suburbano en ${API} …`);
  await call('GET', '/health', { what: 'comprobar la API' });

  const admin = await account('admin');
  grantAdmin(ACCOUNTS.admin.email);
  const zones = await call('GET', '/admin/zones', { auth: admin, what: 'listar zonas' });
  if (zones.some((z) => z.slug === ZONE_SLUG)) {
    console.log('La zona de ejemplo ya existe: no se cambia nada.');
    for (const who of ['bus', 'moto', 'taxi', 'passenger']) await account(who);
    printAccounts();
    return;
  }

  // --- Zone and stops (approximate coordinates, sample data).
  const zone = await call('POST', '/admin/zones', {
    auth: admin,
    body: {
      name: 'Eje Casacoima – San Félix – Puerto Ordaz',
      slug: ZONE_SLUG,
      status: 'active',
      defaultCurrency: 'USD',
      latitude: 8.35,
      longitude: -62.55,
      radiusKm: 45,
    },
    what: 'crear la zona',
  });
  const stop = (kind, name, city, latitude, longitude) =>
    call('POST', '/admin/stops', {
      auth: admin,
      body: { kind, name, city, state: 'Bolívar', latitude, longitude },
      what: `crear la parada ${name}`,
    });
  const casacoima = await stop('stop', 'Parada Casacoima', 'Casacoima', 8.4, -62.3);
  const sanFelix = await stop('terminal', 'Terminal de San Félix', 'San Félix', 8.3725, -62.642);
  const puertoOrdaz = await stop(
    'terminal',
    'Terminal de Puerto Ordaz',
    'Puerto Ordaz',
    8.29,
    -62.73,
  );
  for (const s of [casacoima, sanFelix, puertoOrdaz]) {
    if (s.zoneId !== zone.id) {
      await call('PATCH', `/admin/stops/${s.id}`, { auth: admin, body: { zoneId: zone.id } });
    }
  }

  // --- Three approved operators; their owners also drive.
  const operator = async (who, type, legalName, rif) => {
    const auth = await account(who);
    const { organization } = await call('POST', '/organizations', {
      auth,
      body: { type, legalName, tradeName: legalName, rif },
      what: `registrar ${legalName}`,
    });
    await call('POST', `/admin/organizations/${organization.id}/review`, {
      auth: admin,
      body: { decision: 'approve' },
      what: `aprobar ${legalName}`,
    });
    return { auth, id: organization.id, url: `/organizations/${organization.id}` };
  };
  const bus = await operator('bus', 'bus_company', 'Transporte Guayana (ejemplo)', 'J-40000001-1');
  const moto = await operator('moto', 'moto_line', 'Mototaxis Caroní (ejemplo)', 'J-40000002-2');
  const taxi = await operator('taxi', 'taxi_line', 'Taxis Unidos (ejemplo)', 'J-40000003-3');

  // --- Suburban bus routes, every 15 minutes with open tickets.
  const today = new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10);
  const busRoute = async (name, from, to, minutes, fare) => {
    const route = await call('POST', `${bus.url}/routes`, {
      auth: bus.auth,
      body: {
        name,
        scope: 'suburban',
        stops: [
          { stopId: from.id, minutesFromOrigin: 0 },
          { stopId: to.id, minutesFromOrigin: minutes },
        ],
      },
      what: `crear la ruta ${name}`,
    });
    await call('PUT', `${bus.url}/routes/${route.id}/fares`, {
      auth: bus.auth,
      body: { fares: [{ fromStopId: from.id, toStopId: to.id, amount: fare, currency: 'USD' }] },
    });
    await call('POST', `${bus.url}/routes/${route.id}/schedules`, {
      auth: bus.auth,
      body: {
        departureTime: '05:00',
        lastDepartureTime: '20:00',
        headwayMinutes: 15,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        validFrom: today,
        serviceClass: 'standard',
        seats: 30,
      },
      what: `horario de ${name}`,
    });
    await call('POST', `${bus.url}/routes/${route.id}/status`, {
      auth: bus.auth,
      body: { status: 'active' },
    });
  };
  await busRoute('San Félix – Puerto Ordaz', sanFelix, puertoOrdaz, 40, '0.75');
  await busRoute('Casacoima – San Félix', casacoima, sanFelix, 35, '1.00');
  await call('POST', `${bus.url}/vehicles`, { auth: bus.auth, body: { plate: 'BUS001A' } });

  // --- Taxis and motorcycles on demand: vehicles and fixed fares per stretch.
  await call('POST', `${moto.url}/vehicles`, { auth: moto.auth, body: { plate: 'MOT001A' } });
  await call('PUT', `${moto.url}/taxi/stretch-fares`, {
    auth: moto.auth,
    body: {
      fares: [
        {
          stopIds: [sanFelix.id, puertoOrdaz.id],
          mode: 'motorcycle',
          amount: '2.00',
          currency: 'USD',
        },
        {
          stopIds: [casacoima.id, sanFelix.id],
          mode: 'motorcycle',
          amount: '2.50',
          currency: 'USD',
        },
      ],
    },
    what: 'tarifas por tramo de los mototaxis',
  });
  await call('POST', `${taxi.url}/vehicles`, { auth: taxi.auth, body: { plate: 'TAX001A' } });
  await call('PUT', `${taxi.url}/taxi/stretch-fares`, {
    auth: taxi.auth,
    body: {
      fares: [
        { stopIds: [sanFelix.id, puertoOrdaz.id], mode: 'car', amount: '4.00', currency: 'USD' },
      ],
    },
    what: 'tarifas por tramo de los taxis',
  });
  await call('PUT', `${taxi.url}/taxi/terminals`, {
    auth: taxi.auth,
    body: { stopIds: [sanFelix.id, puertoOrdaz.id] },
    what: 'terminales de los taxis',
  });

  // --- Trip packs: operators that accept them, platform rate and two products.
  for (const org of [bus, moto]) {
    await call('PUT', `/admin/organizations/${org.id}/policy`, {
      auth: admin,
      body: { commissionRate: null, refundTiers: null, acceptsTripPacks: true },
      what: 'habilitar paquetes',
    });
  }
  await call('PUT', '/admin/exchange-rates', {
    auth: admin,
    body: { rates: [{ currency: 'VES', unitsPerUsd: '40' }] },
    what: 'tasa de cambio de la plataforma (de ejemplo)',
  });
  const product = (mode, trips, price, maxFare) =>
    call('POST', '/admin/trip-pack-products', {
      auth: admin,
      body: {
        zoneId: zone.id,
        stopIds: [sanFelix.id, puertoOrdaz.id],
        mode,
        trips,
        price,
        currency: 'USD',
        validityDays: 60,
        maxFare,
      },
      what: `paquete de ${mode}`,
    });
  await product('bus', 20, '12.00', '0.75');
  await product('motorcycle', 10, '17.00', '2.00');

  await account('passenger');
  console.log(
    '\nListo: zona activa, 3 paradas, rutas de bus cada 15 min, mototaxis y taxis por tramo',
  );
  console.log('y dos paquetes de viajes (San Félix ↔ Puerto Ordaz). Todo es de ejemplo.');
  printAccounts();
}

main().catch((error) => {
  console.error(`\n✖ ${error.message}`);
  if (error.reason === 'EMAIL_TAKEN' || error.status === 409) {
    console.error(
      '  Parece que hay datos a medias. Puedes reiniciar la base (opción del menú) y repetir.',
    );
  }
  process.exit(1);
});
