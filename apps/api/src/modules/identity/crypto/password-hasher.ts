import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const KEY_LENGTH = 64;
/** OWASP-recommended scrypt cost (N=2^17, r=8, p=1): ~128 MiB and ~0.1–0.3 s per hash. */
const DEFAULT_PARAMS = { N: 2 ** 17, r: 8, p: 1 } as const;

function derive(password: string, salt: Buffer, params: { N: number; r: number; p: number }) {
  const options: ScryptOptions = { ...params, maxmem: 256 * 1024 * 1024 };
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, options, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

/** Format: `scrypt$N=131072,r=8,p=1$<salt base64url>$<hash base64url>` */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, DEFAULT_PARAMS);
  const { N, r, p } = DEFAULT_PARAMS;
  return `scrypt$N=${N},r=${r},p=${p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

/** Constant-time comparison. Returns false (never throws) for malformed stored hashes. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const match = /^scrypt\$N=(\d+),r=(\d+),p=(\d+)\$([\w-]+)\$([\w-]+)$/.exec(stored);
  if (!match) return false;
  const [, N, r, p, salt, hash] = match as unknown as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const expected = Buffer.from(hash, 'base64url');
  const actual = await derive(password, Buffer.from(salt, 'base64url'), {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * A valid hash of a random password. Verifying against it when the account does not exist
 * keeps response times similar, so timing does not reveal which e-mails are registered.
 */
export const DUMMY_PASSWORD_HASH = await hashPassword(randomBytes(16).toString('hex'));
