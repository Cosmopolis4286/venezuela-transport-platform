// Loads SAMPLE data into a LOCAL database, through the API, so everything goes through the same
// validations as the real app. Coordinates, fares, rates, companies and people are made up: never
// run this against production.
//
// What it loads (each part only once; running it again only prints the accounts):
// - Suburban service Casacoima – San Félix – Puerto Ordaz: zone, buses every 15 minutes,
//   motorcycle taxis and taxis per stretch, taxis at terminals and trip packs.
// - Interurban network: two bus companies with staff (dispatcher, ticket agent, driver,
//   inspector), seat maps, buses, routes with intermediate stops, fares and daily departures.
// - Activity: paid tickets, a reservation waiting for payment, a Pago Móvil payment waiting for
//   review, a cancelled ticket in the refund queue, trips assigned to a bus and driver, cash sales,
//   taxi and motorcycle rides (one finished and rated), a WhatsApp ride, trip packs, and an
//   operator waiting for approval.
// - Drivers' money, quality and safety (stage 3): a 10 % commission with a raise to 12 % announced,
//   rated rides of the independents, a weekly payout, a driver suspended for low ratings who
//   reported paying his commission debt, a licence about to expire, and two emergency alerts.
//
// Usage: node infrastructure/scripts/seed-demo.mjs [--api http://localhost:4000/api/v1]
//        node infrastructure/scripts/seed-demo.mjs --accounts   (only lists the accounts)
// The API must be running (pnpm dev:api) with PAYMENT_PROVIDER empty or `simulated`, and the
// database migrated (the menu does all this: option "Cargar datos de ejemplo").
import { spawnSync } from 'node:child_process';

const API = argValue('--api') ?? process.env.VTP_API_URL ?? 'http://localhost:4000/api/v1';
const PASSWORD = 'vtp-demo-2026';
/** The local database the API uses; by default the container's own (`$POSTGRES_DB`). */
const DATABASE = process.env.VTP_SEED_DB || '$POSTGRES_DB';
const ZONE_SLUG = 'eje-casacoima-san-felix-puerto-ordaz';
const INTERURBAN_MARK = 'Expresos Los Llanos (ejemplo)';
/** Added with the accounts of every role: its presence means that part is loaded. */
const ROLES_MARK = 'Terminal La Bandera (ejemplo)';
/** The platform's line for independent drivers (ADR-039). */
const INDEPENDENTS_MARK = 'VTP Mototaxis Independientes (ejemplo)';
const INDEPENDENTS_TAXI_MARK = 'VTP Taxis Independientes (ejemplo)';

/**
 * Every account of the sample data, one per level of access: the platform's staff, each role of
 * an organization (of each type) and passengers. `role` and `can` are what the list at the end
 * shows; `group` sorts it.
 */
const ACCOUNTS = {
  // --- Platform (not tied to a company).
  admin: {
    group: 'Plataforma',
    email: 'admin@vtp.test',
    firstName: 'Ana',
    lastName: 'Administradora',
    role: 'Administradora de la plataforma',
    can: 'Todo: aprobar empresas y KYC, zonas, paradas, pagos, liquidaciones, reembolsos, facturación, paquetes, métricas y la línea de independientes',
  },
  revisor: {
    group: 'Plataforma',
    email: 'revisor@vtp.test',
    firstName: 'Rafael',
    lastName: 'Revisor',
    role: 'Revisor de la plataforma',
    can: 'Aprobar empresas y KYC (con sus documentos), paradas, buscar reservas, taxis por WhatsApp; sin dinero',
  },
  finanzas: {
    group: 'Plataforma',
    email: 'finanzas@vtp.test',
    firstName: 'Fernanda',
    lastName: 'Finanzas',
    role: 'Finanzas de la plataforma',
    can: 'Pagos por revisar, liquidaciones y pagos a empresas, reembolsos, facturación, tasas y métricas (no aprueba nada)',
  },
  soporte: {
    group: 'Plataforma',
    email: 'soporte@vtp.test',
    firstName: 'Sofía',
    lastName: 'Soporte',
    role: 'Soporte de la plataforma',
    can: 'Buscar reservas, taxis por WhatsApp y ver las colas de revisión (sin cédulas, documentos ni dinero)',
  },
  // --- Companies: owners (every permission of their company, including driving).
  llanos: {
    group: 'Empresas (dueños)',
    email: 'llanos@vtp.test',
    firstName: 'Lorena',
    lastName: 'Dueña de Expresos',
    role: 'Dueña · Expresos Los Llanos (buses interurbanos)',
    can: 'Todo en su empresa, incluido nombrar administradores',
  },
  oriente: {
    group: 'Empresas (dueños)',
    email: 'oriente@vtp.test',
    firstName: 'Óscar',
    lastName: 'Dueño de Aerobuses',
    role: 'Dueño · Aerobuses de Oriente (buses interurbanos)',
    can: 'Todo en su empresa',
  },
  bus: {
    group: 'Empresas (dueños)',
    email: 'empresa@vtp.test',
    firstName: 'Bruno',
    lastName: 'Dueño de buses',
    role: 'Dueño · Transporte Guayana (buses suburbanos)',
    can: 'Todo en su empresa; también maneja y vende en efectivo',
  },
  taxi: {
    group: 'Empresas (dueños)',
    email: 'taxi@vtp.test',
    firstName: 'Tomás',
    lastName: 'Dueño de taxis',
    role: 'Dueño · Taxis Unidos (línea de taxis)',
    can: 'Todo en su línea; también toma viajes',
  },
  moto: {
    group: 'Empresas (dueños)',
    email: 'moto@vtp.test',
    firstName: 'Marta',
    lastName: 'Dueña de mototaxis',
    role: 'Dueña · Mototaxis Caroní (línea de mototaxis)',
    can: 'Todo en su línea; también toma viajes',
  },
  terminal: {
    group: 'Empresas (dueños)',
    email: 'terminal@vtp.test',
    firstName: 'Teodoro',
    lastName: 'Terminal',
    role: 'Dueño · Terminal La Bandera (terminal)',
    can: 'Todo en su terminal',
  },
  pendiente: {
    group: 'Empresas (dueños)',
    email: 'pendiente@vtp.test',
    firstName: 'Paula',
    lastName: 'Pendiente',
    role: 'Dueña · Transporte Sucre (en revisión)',
    can: 'Prepararse (equipo, flota, rutas en borrador); no opera hasta ser aprobada',
  },
  // --- Staff of Expresos Los Llanos: one account per role.
  gerente: {
    group: 'Personal de Expresos Los Llanos',
    email: 'gerente@vtp.test',
    firstName: 'Gabriela',
    lastName: 'Gerente',
    role: 'Administradora',
    can: 'Todo menos conducir y gestionar dueños o administradores',
  },
  despacho: {
    group: 'Personal de Expresos Los Llanos',
    email: 'despacho@vtp.test',
    firstName: 'Diego',
    lastName: 'Despachador',
    role: 'Despachador',
    can: 'Asignar bus y conductor, ver equipo, reservas y manifiestos',
  },
  taquilla: {
    group: 'Personal de Expresos Los Llanos',
    email: 'taquilla@vtp.test',
    firstName: 'Teresa',
    lastName: 'Taquillera',
    role: 'Taquillera',
    can: 'Vender boletos y ver reservas',
  },
  conductor: {
    group: 'Personal de Expresos Los Llanos',
    email: 'conductor@vtp.test',
    firstName: 'Carlos',
    lastName: 'Conductor',
    role: 'Conductor (app de transportistas)',
    can: 'Sus viajes, salida y llegada, validar boletos',
  },
  inspector: {
    group: 'Personal de Expresos Los Llanos',
    email: 'inspector@vtp.test',
    firstName: 'Irene',
    lastName: 'Inspectora',
    role: 'Inspectora de boletos',
    can: 'Validar boletos y ver reservas',
  },
  contador: {
    group: 'Personal de Expresos Los Llanos',
    email: 'contador@vtp.test',
    firstName: 'Camilo',
    lastName: 'Contador',
    role: 'Contador',
    can: 'Saldo, liquidaciones, cobros, reembolsos y reportes de ventas; no opera viajes ni personal',
  },
  supervisor: {
    group: 'Personal de Expresos Los Llanos',
    email: 'supervisor@vtp.test',
    firstName: 'Silvia',
    lastName: 'Supervisora',
    role: 'Supervisora (jefa de patio)',
    can: 'Despacho, validar boletos, ocupación y ver equipo; sin dinero ni rutas',
  },
  // --- Drivers of the taxi and motorcycle lines, and a driver waiting for KYC approval.
  taxista: {
    group: 'Conductores de taxi y moto',
    email: 'taxista@vtp.test',
    firstName: 'Tito',
    lastName: 'Taxista',
    role: 'Conductor · Taxis Unidos (app de transportistas)',
    can: 'Tomar viajes de taxi de su línea',
  },
  mototaxista: {
    group: 'Conductores de taxi y moto',
    email: 'mototaxista@vtp.test',
    firstName: 'Manuel',
    lastName: 'Mototaxista',
    role: 'Conductor · Mototaxis Caroní (app de transportistas)',
    can: 'Tomar viajes en moto de su línea',
  },
  aspirante: {
    group: 'Conductores de taxi y moto',
    email: 'aspirante@vtp.test',
    firstName: 'Alberto',
    lastName: 'Aspirante',
    role: 'Aspirante a taxista independiente (solicitud enviada)',
    can: 'Ver su solicitud; Revisión la aprueba en Administración y entra solo a conducir con VTP',
  },
  independiente: {
    group: 'Conductores de taxi y moto',
    email: 'independiente@vtp.test',
    firstName: 'Iván',
    lastName: 'Independiente',
    role: 'Mototaxista independiente de VTP (app de transportistas)',
    can: 'Tomar viajes en moto con VTP, solo con su propia moto; ver su calificación, la comisión y su pago semanal en Mis cobros',
  },
  suspendido: {
    group: 'Conductores de taxi y moto',
    email: 'suspendido@vtp.test',
    firstName: 'Samuel',
    lastName: 'Suspendido',
    role: 'Mototaxista independiente suspendido por calificación baja',
    can: 'Ver la suspensión y pagar su deuda de comisiones (Mis cobros); Independientes la revisa en Administración',
  },
  // --- Passengers.
  passenger: {
    group: 'Pasajeros',
    email: 'pasajero@vtp.test',
    firstName: 'Pedro',
    lastName: 'Pasajero',
    role: 'Pasajero',
    can: 'Boletos pagados, viaje en moto calificado, paquete de viajes',
  },
  maria: {
    group: 'Pasajeros',
    email: 'maria@vtp.test',
    firstName: 'María',
    lastName: 'González',
    role: 'Pasajera',
    can: 'Boletos y un Pago Móvil; un taxi esperando conductor',
  },
  jose: {
    group: 'Pasajeros',
    email: 'jose@vtp.test',
    firstName: 'José',
    lastName: 'Rodríguez',
    role: 'Pasajero',
    can: 'Un boleto cancelado con reembolso y uno apartado sin pagar',
  },
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

/** One API call, retried on network errors (the API may still be starting) and on 429. */
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
    if (res.status === 429 && attempt < 4) {
      // Per-IP limits of a development API (sign-in: 10 a minute): wait and try again.
      process.stdout.write('  (límite de solicitudes de la API: esperando un minuto…)\n');
      await new Promise((r) => setTimeout(r, 61_000));
      continue;
    }
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) throw new ApiError(res.status, json, what);
    return json;
  }
}

/** Part of the activity that may not apply right now (e.g. no departure near): warn, go on. */
let warnings = 0;
async function attempt(what, fn) {
  try {
    return await fn();
  } catch (error) {
    warnings++;
    console.log(`  ⚠ ${what}: ${error.message}`);
    return undefined;
  }
}

const sessions = new Map();
/** Registers the account, or logs in if it already exists. Returns `Bearer …` (cached). */
async function account(who) {
  if (sessions.has(who)) return sessions.get(who);
  const { role: _role, can: _can, group: _group, ...a } = ACCOUNTS[who];
  let res;
  try {
    res = await call('POST', '/auth/register', {
      body: { ...a, password: PASSWORD, client: 'web', acceptTerms: true },
      what: `crear ${a.email}`,
    });
  } catch (error) {
    if (error.status !== 409) throw error;
    res = await call('POST', '/auth/login', {
      body: { email: a.email, password: PASSWORD, client: 'web' },
      what: `entrar como ${a.email}`,
    });
  }
  const auth = `Bearer ${res.tokens.accessToken}`;
  sessions.set(who, auth);
  return auth;
}

/** SQL straight in the local database (the Postgres of docker compose). */
function sql(statement, what) {
  const r = spawnSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'sh',
      '-c',
      `psql -U "$POSTGRES_USER" -d "${DATABASE}" -c "${statement}"`,
    ],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error(`${what}: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout;
}

/** One value from the local database (`psql -tA`). */
function sqlValue(statement, what) {
  const r = spawnSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'sh',
      '-c',
      `psql -tA -U "$POSTGRES_USER" -d "${DATABASE}" -c "${statement}"`,
    ],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error(`${what}: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout.trim();
}

// Sample accounts only: they get their platform role and a verified e-mail (so invitations to
// organizations reach them) the same way `pnpm platform:grant` and the e-mail code would.
const grantRole = (who, role) =>
  sql(
    `update users set platform_role = '${role}' where email = '${ACCOUNTS[who].email}'`,
    `rol de ${ACCOUNTS[who].email}`,
  );
const verifyEmails = () =>
  sql(
    `update users set email_verified_at = now() where email like '%@vtp.test' and email_verified_at is null`,
    'verificar correos de ejemplo',
  );

// --- Dates in Venezuela (UTC-4 all year).
const VE_OFFSET = 4 * 3600_000;
const dayInVenezuela = (plusDays = 0) =>
  new Date(Date.now() - VE_OFFSET + plusDays * 86_400_000).toISOString().slice(0, 10);

// --- Seat maps (the same presets the portal offers).
function grid(deck, rows, columns, first) {
  const seats = [];
  for (let row = 0; row < rows; row++) {
    for (const column of columns)
      seats.push({ number: String(first + seats.length), deck, row, column });
  }
  return seats;
}
const COACH = {
  name: 'Autobús 2-2',
  decks: 1,
  rows: 11,
  columns: 5,
  seats: grid(0, 11, [0, 1, 3, 4], 1),
};
const SLEEPER = {
  name: 'Buscama 2-1',
  decks: 1,
  rows: 10,
  columns: 4,
  seats: grid(0, 10, [0, 2, 3], 1),
};

let docCounter = 15_000_000;
const traveller = (firstName, lastName, seatNumber) => ({
  seatNumber,
  firstName,
  lastName,
  documentType: 'V',
  documentNumber: String(docCounter++),
});

// =====================================================================================
// Suburban service (the first sample data; unchanged).
// =====================================================================================
async function suburban(admin) {
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

  const bus = await operator(
    admin,
    'bus',
    'bus_company',
    'Transporte Guayana (ejemplo)',
    'J-40000001-1',
  );
  const moto = await operator(
    admin,
    'moto',
    'moto_line',
    'Mototaxis Caroní (ejemplo)',
    'J-40000002-2',
  );
  const taxi = await operator(admin, 'taxi', 'taxi_line', 'Taxis Unidos (ejemplo)', 'J-40000003-3');

  const today = dayInVenezuela();
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
    return route;
  };
  const sfPo = await busRoute('San Félix – Puerto Ordaz', sanFelix, puertoOrdaz, 40, '0.75');
  await busRoute('Casacoima – San Félix', casacoima, sanFelix, 35, '1.00');
  await call('POST', `${bus.url}/vehicles`, { auth: bus.auth, body: { plate: 'BUS001A' } });

  const motoVehicle = await call('POST', `${moto.url}/vehicles`, {
    auth: moto.auth,
    body: { plate: 'MOT001A' },
  });
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
  const taxiVehicle = await call('POST', `${taxi.url}/vehicles`, {
    auth: taxi.auth,
    body: { plate: 'TAX001A' },
  });
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

  for (const org of [bus, moto]) {
    await call('PUT', `/admin/organizations/${org.id}/policy`, {
      auth: admin,
      body: { commissionRate: null, refundTiers: null, acceptsTripPacks: true },
      what: 'habilitar paquetes',
    });
  }
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
  const busPack = await product('bus', 20, '12.00', '0.75');
  await product('motorcycle', 10, '17.00', '2.00');
  console.log('  ✔ Suburbano: zona, 3 paradas, buses cada 15 min, mototaxis, taxis y 2 paquetes');
  return { bus, moto, taxi, sanFelix, puertoOrdaz, sfPo, busPack, motoVehicle, taxiVehicle };
}

/** An operator registered by its owner and approved by the platform. */
async function operator(admin, who, type, legalName, rif) {
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
}

/** Finds the sample objects of the suburban part when it was loaded by an earlier run. */
async function existingSuburban(admin) {
  const orgs = await call('GET', '/admin/organizations?status=active', {
    auth: admin,
    what: 'listar empresas',
  });
  const list = Array.isArray(orgs) ? orgs : (orgs.items ?? orgs.organizations ?? []);
  const byName = (name) => list.find((o) => o.legalName === name);
  const make = async (who, name) => {
    const org = byName(name);
    if (!org) return null;
    return { auth: await account(who), id: org.id, url: `/organizations/${org.id}` };
  };
  const stops = await call('GET', '/stops');
  const stopNamed = (name) => stops.find((s) => s.name === name);
  const bus = await make('bus', 'Transporte Guayana (ejemplo)');
  const moto = await make('moto', 'Mototaxis Caroní (ejemplo)');
  const taxi = await make('taxi', 'Taxis Unidos (ejemplo)');
  const vehicleOf = async (org) =>
    org ? (await call('GET', `${org.url}/vehicles`, { auth: org.auth }))[0] : undefined;
  const routes = bus ? await call('GET', `${bus.url}/routes`, { auth: bus.auth }) : [];
  const products = await call('GET', '/trip-pack-products').catch(() => []);
  return {
    bus,
    moto,
    taxi,
    sanFelix: stopNamed('Terminal de San Félix'),
    puertoOrdaz: stopNamed('Terminal de Puerto Ordaz'),
    sfPo: (Array.isArray(routes) ? routes : []).find((r) => r.name === 'San Félix – Puerto Ordaz'),
    busPack: (Array.isArray(products) ? products : []).find((p) => p.mode === 'bus'),
    motoVehicle: await vehicleOf(moto),
    taxiVehicle: await vehicleOf(taxi),
  };
}

// =====================================================================================
// Interurban network: two companies, staff, buses, routes, fares and departures.
// =====================================================================================
async function interurban(admin, sub) {
  const terminal = (name, city, state, latitude, longitude) =>
    call('POST', '/admin/stops', {
      auth: admin,
      body: { kind: 'terminal', name, city, state, latitude, longitude },
      what: `crear ${name}`,
    });
  const caracas = await terminal(
    'Terminal La Bandera',
    'Caracas',
    'Distrito Capital',
    10.478,
    -66.902,
  );
  const maracay = await terminal('Terminal de Maracay', 'Maracay', 'Aragua', 10.246, -67.594);
  const valencia = await terminal(
    'Terminal Big Low Center',
    'Valencia',
    'Carabobo',
    10.153,
    -67.996,
  );
  const barquisimeto = await terminal(
    'Terminal de Barquisimeto',
    'Barquisimeto',
    'Lara',
    10.066,
    -69.319,
  );
  const plc = await terminal(
    'Terminal de Puerto La Cruz',
    'Puerto La Cruz',
    'Anzoátegui',
    10.215,
    -64.633,
  );
  const maturin = await terminal('Terminal de Maturín', 'Maturín', 'Monagas', 9.749, -63.177);
  const ciudadBolivar = await terminal(
    'Terminal de Ciudad Bolívar',
    'Ciudad Bolívar',
    'Bolívar',
    8.124,
    -63.547,
  );

  const llanos = await operator(admin, 'llanos', 'bus_company', INTERURBAN_MARK, 'J-40000004-4');
  const oriente = await operator(
    admin,
    'oriente',
    'bus_company',
    'Aerobuses de Oriente (ejemplo)',
    'J-40000005-5',
  );

  // Staff of Expresos Los Llanos: invited by e-mail, they accept in their account.
  verifyEmails();
  const staff = {};
  for (const [who, role] of [
    ['despacho', 'dispatcher'],
    ['taquilla', 'ticket_agent'],
    ['conductor', 'driver'],
    ['inspector', 'inspector'],
  ]) {
    const auth = await account(who);
    verifyEmails();
    await call('POST', `${llanos.url}/invitations`, {
      auth: llanos.auth,
      body: { contactKind: 'email', destination: ACCOUNTS[who].email, role },
      what: `invitar a ${ACCOUNTS[who].email}`,
    });
    const received = await call('GET', '/me/invitations', { auth });
    const invitation = received.find((i) => i.organization?.id === llanos.id) ?? received[0];
    await call('POST', `/me/invitations/${invitation.id}/accept`, {
      auth,
      what: `aceptar invitación (${who})`,
    });
    staff[who] = auth;
  }

  const company = async (org, plates) => {
    const coach = await call('POST', `${org.url}/seat-layouts`, { auth: org.auth, body: COACH });
    const sleeper = await call('POST', `${org.url}/seat-layouts`, {
      auth: org.auth,
      body: SLEEPER,
    });
    const vehicles = [];
    for (const [plate, label, layout] of plates) {
      vehicles.push(
        await call('POST', `${org.url}/vehicles`, {
          auth: org.auth,
          body: { plate, label, seatLayoutId: (layout === 'sleeper' ? sleeper : coach).id },
          what: `vehículo ${plate}`,
        }),
      );
    }
    return { coach, sleeper, vehicles };
  };
  const llanosFleet = await company(llanos, [
    ['AB123CD', 'Unidad 01', 'coach'],
    ['AB124CD', 'Unidad 02', 'coach'],
    ['AB125CD', 'Unidad 03', 'sleeper'],
  ]);
  const orienteFleet = await company(oriente, [
    ['AE501BC', 'Buscama 10', 'sleeper'],
    ['AE502BC', 'Buscama 11', 'sleeper'],
    ['AE503BC', 'Autobús 20', 'coach'],
  ]);

  const today = dayInVenezuela();
  /** stops: [stop, minutes]; fares: [fromIndex, toIndex, amount]; departures: [time, class, layout]. */
  const route = async (org, name, stops, fares, departures) => {
    const created = await call('POST', `${org.url}/routes`, {
      auth: org.auth,
      body: {
        name,
        stops: stops.map(([stop, minutes]) => ({ stopId: stop.id, minutesFromOrigin: minutes })),
      },
      what: `crear la ruta ${name}`,
    });
    await call('PUT', `${org.url}/routes/${created.id}/fares`, {
      auth: org.auth,
      body: {
        fares: fares.map(([a, b, amount]) => ({
          fromStopId: stops[a][0].id,
          toStopId: stops[b][0].id,
          amount,
          currency: 'USD',
        })),
      },
      what: `tarifas de ${name}`,
    });
    const schedules = [];
    for (const [departureTime, serviceClass, layout] of departures) {
      const res = await call('POST', `${org.url}/routes/${created.id}/schedules`, {
        auth: org.auth,
        body: {
          departureTime,
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          validFrom: today,
          serviceClass,
          seatLayoutId: layout.id,
        },
        what: `salida ${departureTime} de ${name}`,
      });
      schedules.push(...(res.schedules ?? [res]));
    }
    await call('POST', `${org.url}/routes/${created.id}/status`, {
      auth: org.auth,
      body: { status: 'active' },
    });
    return { ...created, stops: stops.map(([s]) => s), schedules };
  };

  // Bolívar prices use the BCV's official rate (ADR-048). The API fetches it every few hours;
  // offline, the demo types one so Pago Móvil shows amounts.
  await attempt('tasa oficial del BCV', () =>
    call('PUT', '/admin/fiscal/bcv-rates', {
      auth: admin,
      body: { date: dayInVenezuela(0), unitsPerUsd: '40' },
    }),
  );

  const { coach, sleeper } = llanosFleet;
  const ccsVal = await route(
    llanos,
    'Caracas – Valencia',
    [
      [caracas, 0],
      [maracay, 80],
      [valencia, 150],
    ],
    [
      [0, 1, '6'],
      [0, 2, '10'],
      [1, 2, '5'],
    ],
    [
      ['06:00', 'standard', coach],
      ['10:00', 'standard', coach],
      ['14:00', 'standard', coach],
      ['18:00', 'standard', coach],
    ],
  );
  const ccsBqto = await route(
    llanos,
    'Caracas – Barquisimeto',
    [
      [caracas, 0],
      [valencia, 150],
      [barquisimeto, 330],
    ],
    [
      [0, 1, '10'],
      [0, 2, '18'],
      [1, 2, '9'],
    ],
    [
      ['08:00', 'standard', coach],
      ['22:00', 'executive', sleeper],
    ],
  );
  const valCcs = await route(
    llanos,
    'Valencia – Caracas',
    [
      [valencia, 0],
      [maracay, 70],
      [caracas, 150],
    ],
    [
      [0, 1, '5'],
      [0, 2, '10'],
      [1, 2, '6'],
    ],
    [
      ['07:00', 'standard', coach],
      ['15:00', 'standard', coach],
    ],
  );
  const ccsPlc = await route(
    oriente,
    'Caracas – Puerto La Cruz',
    [
      [caracas, 0],
      [plc, 300],
    ],
    [[0, 1, '15']],
    [
      ['07:30', 'executive', orienteFleet.sleeper],
      ['21:00', 'executive', orienteFleet.sleeper],
    ],
  );
  const poCcs = await route(
    oriente,
    'Puerto Ordaz – Caracas',
    [
      [sub?.puertoOrdaz ?? ciudadBolivar, 0],
      [ciudadBolivar, 90],
      [caracas, 660],
    ],
    [
      [0, 1, '4'],
      [0, 2, '30'],
      [1, 2, '27'],
    ],
    [['19:00', 'executive', orienteFleet.sleeper]],
  );
  await route(
    oriente,
    'Maturín – Puerto La Cruz',
    [
      [maturin, 0],
      [plc, 180],
    ],
    [[0, 1, '8']],
    [
      ['09:00', 'standard', orienteFleet.coach],
      ['16:00', 'standard', orienteFleet.coach],
    ],
  );
  console.log(
    '  ✔ Interurbano: 7 terminales, 2 empresas, 6 vehículos, 6 rutas y 12 salidas diarias',
  );
  console.log('  ✔ Personal de Expresos Los Llanos: despacho, taquilla, conductor e inspectora');
  return {
    llanos,
    oriente,
    staff,
    llanosFleet,
    ccsVal,
    ccsBqto,
    valCcs,
    ccsPlc,
    poCcs,
    caracas,
    valencia,
    maracay,
  };
}

// =====================================================================================
// Activity: tickets, payments, refunds, dispatch, cash sales, taxis, packs, a pending operator.
// =====================================================================================
async function activity(admin, sub, net) {
  const tomorrow = dayInVenezuela(1);
  const inTwoDays = dayInVenezuela(2);

  // The platform's accounts for manual payments (Pago Móvil) and the exchange rate.
  await attempt('cuenta de Pago Móvil de la plataforma', () =>
    call('PUT', '/admin/payment-accounts/pago_movil', {
      auth: admin,
      body: {
        fields: {
          bank: '0102 – Banco de Venezuela',
          phone: '0414-1234567',
          document: 'J-40000000-0',
        },
        active: true,
      },
    }),
  );

  const book = (who, routeObj, schedule, date, fromIndex, toIndex, travellers) =>
    attempt(`reserva de ${ACCOUNTS[who].email} en ${routeObj.name}`, async () =>
      call('POST', '/bookings', {
        auth: await account(who),
        body: {
          scheduleId: schedule.id,
          serviceDate: date,
          fromStopId: routeObj.stops[fromIndex].id,
          toStopId: routeObj.stops[toIndex].id,
          passengers: travellers,
        },
      }),
    );
  const paySimulated = (who, booking) =>
    booking &&
    attempt(`pago de ${booking.code}`, async () => {
      const auth = await account(who);
      const payment = await call('POST', `/me/bookings/${booking.id}/payments`, {
        auth,
        body: { method: 'usdt' },
      });
      await call('POST', `/me/payments/${payment.id}/simulate`, { auth, body: {} });
      return payment;
    });

  let tickets = 0;
  const paid = [];
  // Pedro: Caracas → Valencia tomorrow at 06:00 (two seats) and Caracas → Barquisimeto by night.
  const pedro1 = await book('passenger', net.ccsVal, net.ccsVal.schedules[0], tomorrow, 0, 2, [
    traveller('Pedro', 'Pasajero', '5'),
    traveller('Lucía', 'Pasajero', '6'),
  ]);
  if (await paySimulated('passenger', pedro1)) ((tickets += 2), paid.push(pedro1));
  const pedro2 = await book('passenger', net.ccsBqto, net.ccsBqto.schedules[1], inTwoDays, 0, 2, [
    traveller('Pedro', 'Pasajero', '1'),
  ]);
  if (await paySimulated('passenger', pedro2)) tickets++;
  // María: Maracay → Valencia tomorrow (paid) and Caracas → Puerto La Cruz with Pago Móvil, reported.
  const maria1 = await book('maria', net.ccsVal, net.ccsVal.schedules[0], tomorrow, 1, 2, [
    traveller('María', 'González', '9'),
  ]);
  if (await paySimulated('maria', maria1)) (tickets++, paid.push(maria1));
  const maria2 = await book('maria', net.ccsPlc, net.ccsPlc.schedules[0], inTwoDays, 0, 1, [
    traveller('María', 'González', '3'),
  ]);
  const manual =
    maria2 &&
    (await attempt('Pago Móvil reportado', async () => {
      const auth = await account('maria');
      const payment = await call('POST', `/me/bookings/${maria2.id}/payments`, {
        auth,
        body: { method: 'pago_movil' },
      });
      // Reporting it (for the admins' review queue) only exists with PAYMENT_PROVIDER=manual; with
      // the simulated provider it stays started, with the Pago Móvil instructions to show.
      const reported = await call('POST', `/me/payments/${payment.id}/report`, {
        auth,
        body: { operationNumber: '004512873301' },
      }).then(
        () => true,
        () => false,
      );
      return reported ? 'por revisar en Administración → Pagos' : 'iniciado, esperando el pago';
    }));
  // José: Valencia → Caracas tomorrow, paid and then cancelled (refund queue); Puerto Ordaz →
  // Caracas waiting for payment.
  const jose1 = await book('jose', net.valCcs, net.valCcs.schedules[1], inTwoDays, 0, 2, [
    traveller('José', 'Rodríguez', '12'),
  ]);
  if (await paySimulated('jose', jose1)) {
    await attempt('cancelar el boleto de José', async () =>
      call('POST', `/me/bookings/${jose1.id}/cancel`, { auth: await account('jose'), body: {} }),
    );
  }
  await book('jose', net.poCcs, net.poCcs.schedules[0], inTwoDays, 0, 2, [
    traveller('José', 'Rodríguez', '7'),
  ]);
  // More passengers on tomorrow's 06:00 so the manifest and the occupancy have something to show.
  for (const [i, seat] of ['14', '15', '21', '22', '30'].entries()) {
    const b = await book(
      'passenger',
      net.ccsVal,
      net.ccsVal.schedules[0],
      tomorrow,
      0,
      i % 2 ? 1 : 2,
      [
        traveller(
          ['Ana', 'Luis', 'Rosa', 'Jesús', 'Carmen'][i],
          ['Pérez', 'Medina', 'Silva', 'Torres', 'Rojas'][i],
          seat,
        ),
      ],
    );
    if (await paySimulated('passenger', b)) tickets++;
  }
  console.log(
    `  ✔ Boletos: ${tickets} pagados, 1 apartado sin pagar, 1 Pago Móvil ${manual ?? '(no se pudo)'} y 1 cancelado con reembolso`,
  );

  // Dispatch: tomorrow's departures of Expresos Los Llanos get a free bus with their seat map; the
  // first one also gets the driver. A bus or driver cannot be on two trips at once.
  const assigned = await attempt('asignar buses y conductor', async () => {
    const board = await call('GET', `${net.llanos.url}/dispatch?date=${tomorrow}`, {
      auth: net.staff.despacho,
    });
    const driver = board.drivers.find((d) => d.firstName === 'Carlos') ?? board.drivers[0];
    const busy = new Map(); // vehicle id → [departs, arrives][]
    const free = (v, from, to) => (busy.get(v.id) ?? []).every(([a, b]) => to <= a || from >= b);
    let count = 0;
    for (const departure of board.departures) {
      const from = Date.parse(departure.departsAt);
      // Back at the terminal and cleaned: one hour between trips.
      const to = Date.parse(departure.arrivesAt) + 3600_000;
      const vehicle = board.vehicles.find(
        (v) => v.seatLayoutId === departure.seatLayoutId && free(v, from, to),
      );
      if (!vehicle) continue;
      const ok = await attempt(
        `asignar ${departure.route.name} ${departure.departsAt.slice(11, 16)}`,
        () =>
          call('PUT', `${net.llanos.url}/dispatch/assignment`, {
            auth: net.staff.despacho,
            body: {
              scheduleId: departure.scheduleId,
              serviceDate: departure.serviceDate,
              vehicleId: vehicle.id,
              driverUserId: count === 0 ? (driver?.userId ?? null) : null,
            },
          }),
      );
      if (ok) {
        busy.set(vehicle.id, [...(busy.get(vehicle.id) ?? []), [from, to]]);
        count++;
      }
    }
    return { count, total: board.departures.length };
  });
  if (assigned) {
    console.log(
      `  ✔ Despacho de mañana: ${assigned.count} de ${assigned.total} salidas con bus (la primera con conductor); las demás quedan para el despachador`,
    );
  }

  // Cash sales on the suburban bus (the owner drives too).
  if (sub.bus && sub.sfPo) {
    let cash = 0;
    for (const passengers of [1, 2, 1, 3]) {
      const ok = await attempt('venta en efectivo', () =>
        call('POST', `${sub.bus.url}/cash-sales`, {
          auth: sub.bus.auth,
          body: {
            routeId: sub.sfPo.id,
            fromStopId: sub.sanFelix.id,
            toStopId: sub.puertoOrdaz.id,
            passengers,
          },
        }),
      );
      if (ok) cash += passengers;
    }
    console.log(`  ✔ Ventas en efectivo del bus suburbano: ${cash} pasajeros`);
  }

  // Taxis and motorcycles: a motorcycle ride taken, finished and rated; a taxi waiting at the terminal.
  if (sub.moto && sub.motoVehicle && sub.sanFelix && sub.puertoOrdaz) {
    const done = await attempt('viaje en moto completo', async () => {
      const auth = await account('passenger');
      const ride = await call('POST', '/me/taxi-rides', {
        auth,
        body: {
          kind: 'stretch',
          fromStopId: sub.sanFelix.id,
          toStopId: sub.puertoOrdaz.id,
          mode: 'motorcycle',
          address: 'Av. Guayana, frente a la panadería',
          passengers: 1,
        },
      });
      const step = (path, body = {}) =>
        call('POST', `/me/taxi/rides/${ride.id}/${path}`, { auth: sub.moto.auth, body });
      // Only online drivers take rides (ADR-040); offline again once it is done.
      await call('PUT', '/me/taxi/availability', { auth: sub.moto.auth, body: { online: true } });
      await step('accept', { organizationId: sub.moto.id, vehicleId: sub.motoVehicle.id });
      const seen = await call('GET', `/me/taxi-rides/${ride.id}`, { auth });
      await step('pickup', seen.pickupCode ? { pickupCode: seen.pickupCode } : {});
      await step('complete', {});
      await call('PUT', '/me/taxi/availability', { auth: sub.moto.auth, body: { online: false } });
      await call('POST', `/me/taxi-rides/${ride.id}/rate`, {
        auth,
        body: { rating: 5, comment: 'Rápido y amable' },
      });
      return true;
    });
    const waiting = await attempt('taxi esperando en el terminal', async () =>
      call('POST', '/me/taxi-rides', {
        auth: await account('maria'),
        body: {
          kind: 'terminal',
          terminalStopId: sub.puertoOrdaz.id,
          direction: 'from_terminal',
          address: 'Urb. Alta Vista, calle 5, casa 12',
          passengers: 2,
        },
      }),
    );
    const whatsapp = await attempt('taxi pedido por WhatsApp', () =>
      call('POST', '/admin/taxi-rides', {
        auth: admin,
        body: {
          customerName: 'Carmen',
          customerPhone: '0416-5551234',
          kind: 'terminal',
          terminalStopId: sub.sanFelix.id,
          direction: 'to_terminal',
          address: 'Calle Bolívar, frente a la plaza',
          passengers: 1,
        },
      }),
    );
    console.log(
      `  ✔ Taxis y motos: ${[done && '1 viaje en moto terminado y calificado', waiting && '1 taxi esperando conductor', whatsapp && '1 pedido por WhatsApp'].filter(Boolean).join(', ')}`,
    );
  }

  // A trip pack bought and paid by Pedro.
  if (sub.busPack) {
    const pack = await attempt('paquete de viajes', async () => {
      const auth = await account('passenger');
      const bought = await call('POST', '/me/trip-packs', {
        auth,
        body: { productId: sub.busPack.id },
      });
      const payment = await call('POST', `/me/trip-packs/${bought.id}/payments`, {
        auth,
        body: { method: 'usdt' },
      });
      await call('POST', `/me/payments/${payment.id}/simulate`, { auth, body: {} });
      return bought;
    });
    if (pack) console.log('  ✔ Paquete de 20 viajes en bus comprado por Pedro');
  }

  // An operator that registered and waits for the platform's review.
  const pending = await attempt('empresa pendiente de aprobación', async () =>
    call('POST', '/organizations', {
      auth: await account('pendiente'),
      body: {
        type: 'bus_company',
        legalName: 'Transporte Sucre (ejemplo)',
        tradeName: 'Transporte Sucre (ejemplo)',
        rif: 'J-40000006-6',
      },
    }),
  );
  if (pending) console.log('  ✔ Transporte Sucre espera aprobación en Administración');
  return paid;
}

// =====================================================================================
// Every level of access: the roles still missing, a terminal and a KYC application.
// =====================================================================================

/** Invites `who` by e-mail to the organization with `role`; they accept in their account. */
async function join(org, who, role) {
  const auth = await account(who);
  verifyEmails();
  await call('POST', `${org.url}/invitations`, {
    auth: org.auth,
    body: { contactKind: 'email', destination: ACCOUNTS[who].email, role },
    what: `invitar a ${ACCOUNTS[who].email}`,
  });
  const received = await call('GET', '/me/invitations', { auth });
  const invitation = received.find((i) => i.organization?.id === org.id) ?? received[0];
  await call('POST', `/me/invitations/${invitation.id}/accept`, {
    auth,
    what: `aceptar invitación (${who})`,
  });
  return auth;
}

async function everyRole(admin) {
  const active = await call('GET', '/admin/organizations?status=active', { auth: admin });
  const org = async (who, legalName) => {
    const found = active.find((o) => o.legalName === legalName);
    return found && { auth: await account(who), id: found.id, url: `/organizations/${found.id}` };
  };
  const llanos = await org('llanos', INTERURBAN_MARK);
  const taxi = await org('taxi', 'Taxis Unidos (ejemplo)');
  const moto = await org('moto', 'Mototaxis Caroní (ejemplo)');
  const done = [];
  if (
    llanos &&
    (await attempt('administradora de Expresos', () => join(llanos, 'gerente', 'admin')))
  ) {
    done.push('administradora de empresa');
  }
  if (taxi && (await attempt('taxista', () => join(taxi, 'taxista', 'driver'))))
    done.push('taxista');
  if (moto && (await attempt('mototaxista', () => join(moto, 'mototaxista', 'driver')))) {
    done.push('mototaxista');
  }
  if (
    await attempt('terminal', () =>
      operator(admin, 'terminal', 'terminal', ROLES_MARK, 'J-40000007-7'),
    )
  ) {
    done.push('terminal');
  }
  console.log(`  ✔ Todos los niveles: ${done.join(', ')}`);
}

/** Uploads small sample KYC documents (a PNG and PDFs; the API checks the type by content). */
async function uploadKyc(auth, kinds) {
  const nextYear = `${new Date().getFullYear() + 1}-12-31`;
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x70, 0x6e, 0x67]);
  const pdf = (label) => new TextEncoder().encode(`%PDF-1.4\n% ${label} (ejemplo)\n`);
  const files = {
    identity_document: [png, 'cedula.png', 'image/png'],
    driver_license: [pdf('licencia'), 'licencia.pdf', 'application/pdf', nextYear],
    medical_certificate: [pdf('certificado médico'), 'medico.pdf', 'application/pdf'],
    vehicle_registration: [pdf('carnet de circulación'), 'carnet.pdf', 'application/pdf'],
    liability_insurance: [pdf('póliza RCV'), 'rcv.pdf', 'application/pdf', nextYear],
  };
  for (const kind of kinds) {
    const [bytes, name, type, expiresOn] = files[kind];
    const form = new FormData();
    form.append('file', new Blob([bytes], { type }), name);
    if (expiresOn) form.append('expiresOn', expiresOn);
    const res = await fetch(`${API}/me/application/documents/${kind}`, {
      method: 'PUT',
      headers: { authorization: auth },
      body: form,
    });
    if (!res.ok) throw new Error(`documento ${kind}: HTTP ${res.status} ${await res.text()}`);
  }
}

/** An independent driver's application with their own vehicle (ADR-039): no company to choose. */
async function applyAsIndependent(who, mode, documentNumber, vehicle) {
  const auth = await account(who);
  const application = await call('POST', '/me/application', {
    auth,
    body: {
      mode,
      firstName: ACCOUNTS[who].firstName,
      lastName: ACCOUNTS[who].lastName,
      documentType: 'V',
      documentNumber,
      birthDate: '1992-03-15',
      state: 'Bolívar',
      city: 'San Félix',
      vehicle,
    },
    what: `solicitud de ${ACCOUNTS[who].email}`,
  });
  await uploadKyc(auth, [
    'identity_document',
    'driver_license',
    'medical_certificate',
    'vehicle_registration',
    'liability_insurance',
  ]);
  await call('POST', '/me/application/submit', { auth, body: {} });
  return application;
}

/**
 * Independent drivers (ADR-039): the platform's two lines (taxis and motorcycles, both shown as
 * "VTP"), with the fixed fares of the sample stretch; a motorcycle driver already approved and a
 * car driver whose application waits for review. Each part is added only if missing.
 */
async function independents() {
  const admin = await account('admin');
  const done = [];
  const stops = await call('GET', '/stops');
  const sanFelix = stops.find((x) => x.name === 'Terminal de San Félix');
  const puertoOrdaz = stops.find((x) => x.name === 'Terminal de Puerto Ordaz');
  const existing = await call('GET', '/admin/independent-lines', { auth: admin });
  const line = async (type, legalName, rif, mode, amount) => {
    const found = existing.find((l) => l.organization.type === type);
    if (found) return found.organization;
    const { organization } = await call('POST', '/admin/independent-lines', {
      auth: admin,
      body: { type, legalName, tradeName: 'VTP', rif },
      what: `crear ${legalName}`,
    });
    if (sanFelix && puertoOrdaz) {
      await attempt(`tarifa de ${legalName}`, () =>
        call('PUT', `/organizations/${organization.id}/taxi/stretch-fares`, {
          auth: admin,
          body: {
            fares: [{ stopIds: [sanFelix.id, puertoOrdaz.id], mode, amount, currency: 'USD' }],
          },
        }),
      );
      if (type === 'taxi_line') {
        await attempt('terminales de los taxis de VTP', () =>
          call('PUT', `/organizations/${organization.id}/taxi/terminals`, {
            auth: admin,
            body: { stopIds: [sanFelix.id, puertoOrdaz.id] },
          }),
        );
      }
    }
    done.push(type === 'moto_line' ? 'motos de VTP' : 'taxis de VTP');
    return organization;
  };
  await line('moto_line', INDEPENDENTS_MARK, 'J-40000008-8', 'motorcycle', '1.80');
  await line('taxi_line', INDEPENDENTS_TAXI_MARK, 'J-40000009-9', 'car', '3.50');

  const hasApplication = (who) =>
    sqlValue(
      `select count(*) from provider_applications a join users u on u.id = a.user_id where u.email = '${ACCOUNTS[who].email}'`,
      `buscar la solicitud de ${ACCOUNTS[who].email}`,
    ) !== '0';
  if (!hasApplication('independiente')) {
    const joined = await attempt('mototaxista independiente', async () => {
      const application = await applyAsIndependent('independiente', 'motorcycle', 'V-20123456', {
        plate: 'MOT777V',
        make: 'Bera',
        model: 'SBR',
        year: 2022,
        color: 'Rojo',
      });
      const reviewer = await account('revisor');
      const full = await call('GET', `/admin/applications/${application.id}`, { auth: reviewer });
      await call('POST', `/admin/applications/${application.id}/review`, {
        auth: reviewer,
        body: {
          decision: 'approve',
          documents: full.documents.map((d) => ({ documentId: d.id, status: 'accepted' })),
        },
        what: 'aprobar al independiente',
      });
      return true;
    });
    if (joined) done.push('un mototaxista independiente ya aprobado');
  }
  if (!hasApplication('aspirante')) {
    const sent = await attempt('solicitud del aspirante', () =>
      applyAsIndependent('aspirante', 'car', 'V-19876543', {
        plate: 'TAX555A',
        make: 'Chevrolet',
        model: 'Aveo',
        year: 2012,
        color: 'Blanco',
      }),
    );
    if (sent) done.push('un taxista aspirante esperando revisión');
  }
  if (done.length) console.log(`  ✔ Independientes: ${done.join(', ')}`);
}

/**
 * The roles added last (finance and support staff of the platform, accountant and supervisor of
 * Expresos Los Llanos): loaded on their own, so a database with older samples gets them too.
 */
async function latestRoles() {
  const member = (who) =>
    sqlValue(
      `select count(*) from organization_memberships m join users u on u.id = m.user_id where u.email = '${ACCOUNTS[who].email}'`,
      `buscar a ${ACCOUNTS[who].email}`,
    ) !== '0';
  const done = [];
  for (const [who, role] of [
    ['finanzas', 'finance'],
    ['soporte', 'support'],
  ]) {
    const ok = await attempt(`cuenta ${who}`, async () => {
      await account(who);
      grantRole(who, role);
      return true;
    });
    if (ok) done.push(ACCOUNTS[who].role.toLowerCase());
  }
  const pending = ['contador', 'supervisor'].filter((who) => !member(who));
  if (pending.length) {
    const admin = await account('admin');
    const active = await call('GET', '/admin/organizations?status=active', { auth: admin });
    const found = active.find((o) => o.legalName === INTERURBAN_MARK);
    if (found) {
      const llanos = {
        auth: await account('llanos'),
        id: found.id,
        url: `/organizations/${found.id}`,
      };
      for (const [who, role] of [
        ['contador', 'accountant'],
        ['supervisor', 'supervisor'],
      ]) {
        if (pending.includes(who) && (await attempt(who, () => join(llanos, who, role)))) {
          done.push(`${ACCOUNTS[who].role.toLowerCase()} de Expresos`);
        }
      }
    }
  }
  if (done.length) console.log(`  ✔ Roles nuevos: ${done.join(', ')}`);
}

/**
 * Stage 3 of the independent drivers (ADR-042 to ADR-046), on top of `independents()`: the
 * commission, rated rides with their commissions and credits, the weekly payout, a driver
 * suspended for low ratings who reported paying his debt, an expiring licence and two emergency
 * alerts. Past rides go straight into the database (they happened before today); what has a flow
 * (the suspension, the payout, the debt report, the commission raise) goes through the API.
 */
async function stageThree() {
  const done = [];
  const [admin, finance, passenger] = [
    await account('admin'),
    await account('finanzas'),
    await account('passenger'),
  ];
  const id = (statement, what) => {
    const value = sqlValue(statement, what);
    if (!value) throw new Error(`${what}: no está en la base`);
    return value;
  };
  const line = id(
    `select id from organizations where operated_by_platform and type = 'moto_line'`,
    'la línea de motos de VTP',
  );
  const zone = id(
    `select id from operating_zones where slug = '${ZONE_SLUG}'`,
    'la zona de ejemplo',
  );
  const from = id(`select id from stops where name = 'Terminal de San Félix'`, 'San Félix');
  const to = id(`select id from stops where name = 'Terminal de Puerto Ordaz'`, 'Puerto Ordaz');
  const userId = (who) => id(`select id from users where email = '${ACCOUNTS[who].email}'`, who);

  // --- The suspended driver: an approved independent with his own motorcycle.
  await account('suspendido');
  const reviewer = await account('revisor');
  const application = await applyAsIndependent('suspendido', 'motorcycle', 'V-21987654', {
    plate: 'MOT888S',
    make: 'Empire',
    model: 'Owen',
    year: 2020,
    color: 'Negro',
  });
  const full = await call('GET', `/admin/applications/${application.id}`, { auth: reviewer });
  await call('POST', `/admin/applications/${application.id}/review`, {
    auth: reviewer,
    body: {
      decision: 'approve',
      documents: full.documents.map((d) => ({ documentId: d.id, status: 'accepted' })),
    },
    what: 'aprobar al mototaxista suspendido',
  });

  // --- The commission: 10 % today (as if announced a month ago) and a raise to 12 % announced now.
  sql(
    `update platform_settings set independent_commission_rate = 10.00, independent_commission_next_rate = null, independent_commission_next_from = null`,
    'comisión de independientes',
  );
  await attempt('anunciar la comisión del 12 %', () =>
    call('PUT', '/admin/independent-commission', { auth: finance, body: { rate: '12' } }),
  );
  done.push('comisión del 10 % con subida al 12 % anunciada');

  // --- Past rides of both drivers, rated; `credited` ones were paid with a pack (the driver gets
  // the fare minus 10 %), the rest in cash (the driver owes the 10 %).
  const rides = (who, ratings, comments, credited) => {
    const driver = userId(who);
    const vehicle = id(
      `select id from vehicles where owner_user_id = '${driver}' and organization_id = '${line}'`,
      `la moto de ${who}`,
    );
    const values = ratings
      .map(
        (rating, i) =>
          `('${userId('passenger')}', 'stretch', '${from}', '${to}', '${zone}', 'motorcycle', 'Calle Bolívar, frente a la plaza (ejemplo)', 1, 'completed', now() - interval '${i + 1} days', '${line}', '${driver}', '${vehicle}', 1.80, 'USD', now() - interval '${i + 1} days', now() - interval '${i + 1} days', now() - interval '${i + 1} days', ${rating}, ${comments[i] ? `'${comments[i]}'` : 'null'}, now() - interval '${i + 1} days')`,
      )
      .join(', ');
    sql(
      `insert into taxi_rides (passenger_user_id, kind, from_stop_id, to_stop_id, zone_id, mode, address, passengers, status, expires_at, organization_id, driver_user_id, vehicle_id, fare_amount, fare_currency, accepted_at, picked_up_at, completed_at, rating, rating_comment, rated_at) values ${values}`,
      `viajes de ${who}`,
    );
    sql(
      `insert into settlement_entries (organization_id, taxi_ride_id, kind, collected_by, payee, seats, currency, gross, commission_rate, commission, earned) select organization_id, id, case when n <= ${credited} then 'booking' else 'ride_commission' end::settlement_entry_kind, case when n <= ${credited} then 'platform' else 'operator' end::payment_collection, 'driver', 1, 'USD', 1.80, 10.00, 0.18, case when n <= ${credited} then 1.62 else -0.18 end from (select id, organization_id, row_number() over (order by completed_at) as n from taxi_rides where driver_user_id = '${driver}' and status = 'completed' and not exists (select 1 from settlement_entries e where e.taxi_ride_id = taxi_rides.id)) r`,
      `comisiones de ${who}`,
    );
  };
  rides('independiente', [5, 5, 4, 5, 5, 4, 5, 5, 5, 4, 5, 5], ['Muy amable y puntual'], 6);
  rides(
    'suspendido',
    [2, 3, 2, 3, 3, 2, 3, 2, 3, 2, 3],
    ['Manejó muy rápido', 'Llegó tarde', 'No tenía casco para el pasajero'],
    0,
  );
  done.push('23 viajes calificados de los independientes');

  // --- One more ride of the suspended driver, rated now through the app: his average falls
  // below 4 and the platform suspends him (the real flow, with its notice).
  sql(
    `insert into taxi_rides (passenger_user_id, kind, from_stop_id, to_stop_id, zone_id, mode, address, passengers, status, expires_at, organization_id, driver_user_id, vehicle_id, fare_amount, fare_currency, accepted_at, picked_up_at, completed_at) select '${userId('passenger')}', 'stretch', '${from}', '${to}', '${zone}', 'motorcycle', 'Calle Bolívar (ejemplo)', 1, 'completed', now(), '${line}', u.id, v.id, 1.80, 'USD', now() - interval '40 minutes', now() - interval '30 minutes', now() - interval '10 minutes' from users u join vehicles v on v.owner_user_id = u.id where u.email = '${ACCOUNTS.suspendido.email}'`,
    'último viaje del suspendido',
  );
  const last = id(
    `select id from taxi_rides where driver_user_id = '${userId('suspendido')}' and rating is null order by completed_at desc limit 1`,
    'el último viaje del suspendido',
  );
  sql(
    `insert into settlement_entries (organization_id, taxi_ride_id, kind, collected_by, payee, seats, currency, gross, commission_rate, commission, earned) values ('${line}', '${last}', 'ride_commission', 'operator', 'driver', 1, 'USD', 1.80, 10.00, 0.18, -0.18)`,
    'comisión del último viaje',
  );
  if (
    await attempt('calificar al suspendido', () =>
      call('POST', `/me/taxi-rides/${last}/rate`, {
        auth: passenger,
        body: { rating: 1, comment: 'Iba hablando por teléfono' },
      }),
    )
  ) {
    done.push('un mototaxista suspendido por calificación');
  }

  // --- He pays his commission debt in USDT and reports it: finance verifies it in Liquidaciones.
  await attempt('cuenta USDT de la plataforma', () =>
    call('PUT', '/admin/payment-accounts/usdt', {
      auth: admin,
      body: {
        fields: { network: 'TRON (TRC-20)', address: 'TVtpEjemplo000000000000000000000' },
        active: true,
      },
    }),
  );
  const suspended = await account('suspendido');
  const [debt] = await call('GET', '/me/debts', { auth: suspended });
  if (
    debt &&
    (await attempt('reportar el pago de la deuda', () =>
      call('POST', '/me/debt-payments', {
        auth: suspended,
        body: {
          organizationId: debt.organization.id,
          currency: debt.currency,
          amount: debt.amount,
          method: 'usdt',
          reference: 'TX-EJEMPLO-7731',
        },
      }),
    ))
  ) {
    done.push('un pago de deuda por verificar');
  }

  // --- The healthy independent: where to be paid, and this week's payout of what he is owed.
  const independent = await account('independiente');
  await attempt('cuenta de cobro del independiente', () =>
    call('PUT', '/me/payout-account', {
      auth: independent,
      body: {
        method: 'pago_movil',
        bank: '0102 – Banco de Venezuela',
        account: '0414-5550123',
        holderId: 'V-20123456',
        holderName: 'Iván Independiente',
      },
    }),
  );
  if (
    await attempt('pagos semanales', () =>
      call('POST', '/admin/driver-payouts/run', { auth: finance }),
    )
  ) {
    done.push('el pago semanal del independiente');
  }

  // --- His licence expires in 20 days: the app asks him to renew it.
  sql(
    `update provider_application_documents d set expires_on = current_date + 20 from provider_applications a join users u on u.id = a.user_id where d.application_id = a.id and d.kind = 'driver_license' and u.email = '${ACCOUNTS.independiente.email}'`,
    'licencia por vencer',
  );
  done.push('una licencia por vencer');

  // --- Two emergency alerts on his past rides: one open, one attended.
  sql(
    `insert into safety_incidents (ride_id, reporter_user_id, reporter_role, latitude, longitude, created_at, resolved_at, resolved_by, resolved_notes) select r.id, '${userId('passenger')}', 'passenger', 8.3005, -62.7111, now() - interval '20 minutes', null, null, null from taxi_rides r where r.driver_user_id = '${userId('independiente')}' order by r.completed_at desc limit 1`,
    'emergencia abierta',
  );
  sql(
    `insert into safety_incidents (ride_id, reporter_user_id, reporter_role, latitude, longitude, created_at, resolved_at, resolved_by, resolved_notes) select r.id, r.driver_user_id, 'driver', 8.2954, -62.7340, now() - interval '3 days', now() - interval '3 days' + interval '15 minutes', '${userId('soporte')}', 'Llamamos al conductor: un pasajero agresivo se bajó; el conductor está bien.' from taxi_rides r where r.driver_user_id = '${userId('independiente')}' order by r.completed_at asc limit 1`,
    'emergencia atendida',
  );
  done.push('dos alertas de emergencia');
  console.log(`  ✔ Etapa 3: ${done.join(', ')}`);
}

function printAccounts() {
  console.log(`\nCuentas de ejemplo (contraseña para todas: ${PASSWORD}):`);
  let group;
  for (const account of Object.values(ACCOUNTS)) {
    if (account.group !== group) {
      group = account.group;
      console.log(`\n  ${group}`);
    }
    console.log(`    ${account.email.padEnd(22)} ${account.role}`);
    console.log(`    ${''.padEnd(22)} ↳ ${account.can}`);
  }
  console.log(
    '\n  Invitado (sin cuenta): en la app de pasajeros, al elegir puestos, "Continuar sin crear cuenta".',
  );
  console.log(
    '\nWeb: http://localhost:3000 · Portal y administración: http://localhost:3000/login',
  );
  console.log('Apps: pasajeros y transportistas, con el mismo correo y contraseña.');
}

async function main() {
  if (process.argv.includes('--accounts')) return printAccounts();
  console.log(`Cargando datos de ejemplo en ${API} …`);
  await call('GET', '/health', { what: 'comprobar la API' });

  const admin = await account('admin');
  grantRole('admin', 'admin');
  await account('revisor');
  grantRole('revisor', 'reviewer');

  const orgs = await call('GET', '/admin/organizations?status=active', {
    auth: admin,
    what: 'listar empresas',
  });
  const hasCore = orgs.some((o) => o.legalName === INTERURBAN_MARK);
  const hasRoles = orgs.some((o) => o.legalName === ROLES_MARK);
  const hasLatest =
    sqlValue(
      "select count(*) from users where email in ('finanzas@vtp.test', 'soporte@vtp.test') and platform_role is not null",
      'buscar los roles nuevos',
    ) === '2' &&
    sqlValue(
      "select count(*) from organization_memberships m join users u on u.id = m.user_id where u.email in ('contador@vtp.test', 'supervisor@vtp.test')",
      'buscar los roles nuevos',
    ) === '2';
  if (hasCore && hasRoles && hasLatest) {
    console.log('  · Los datos de ejemplo ya estaban cargados: no se cambia nada.');
  }
  if (!hasCore) {
    const zones = await call('GET', '/admin/zones', { auth: admin, what: 'listar zonas' });
    let sub;
    if (zones.some((z) => z.slug === ZONE_SLUG)) {
      // Loaded by the first version of this script: add the rest on top of it.
      console.log('  · El suburbano ya estaba cargado: se agrega lo demás.');
      sub = await existingSuburban(admin);
    } else {
      sub = await suburban(admin);
    }
    const net = await interurban(admin, sub);
    await activity(admin, sub, net);
  }
  if (!hasRoles) {
    if (hasCore) console.log('  · Se agregan las cuentas de los roles que faltaban.');
    await everyRole(admin);
    // Every sample account exists, even if a part failed (on a full load; an upgrade only adds).
    if (!hasCore) {
      for (const who of Object.keys(ACCOUNTS)) {
        if (!sessions.has(who)) await attempt(`cuenta ${who}`, () => account(who));
      }
    }
  }
  if (!hasLatest) await latestRoles();
  const independentsReady =
    sqlValue(
      `select count(*) from organizations where operated_by_platform`,
      'buscar las líneas de independientes',
    ) === '2' &&
    sqlValue(
      `select count(*) from provider_applications a join users u on u.id = a.user_id where u.email in ('independiente@vtp.test', 'aspirante@vtp.test')`,
      'buscar las solicitudes de ejemplo',
    ) === '2';
  if (!independentsReady) await attempt('independientes', () => independents());
  const stageThreeReady =
    sqlValue(
      `select count(*) from provider_applications a join users u on u.id = a.user_id where u.email = '${ACCOUNTS.suspendido.email}' and a.status = 'approved'`,
      'buscar los datos de la etapa 3',
    ) !== '0';
  if (!stageThreeReady) await attempt('etapa 3', () => stageThree());
  verifyEmails();
  printAccounts();
  if (warnings) {
    console.log(
      `\n${warnings} parte(s) de la actividad no se pudieron cargar (ver ⚠ arriba); el resto está listo.`,
    );
  }
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
