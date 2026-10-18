import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password-hasher.js';

describe('password hasher (scrypt)', () => {
  it('hashes with a random salt in a self-describing format', async () => {
    const a = await hashPassword('correct horse battery');
    const b = await hashPassword('correct horse battery');
    expect(a).toMatch(/^scrypt\$N=131072,r=8,p=1\$[\w-]+\$[\w-]+$/);
    expect(a).not.toBe(b);
  });

  it('verifies the right password and rejects others', async () => {
    const stored = await hashPassword('correct horse battery');
    await expect(verifyPassword('correct horse battery', stored)).resolves.toBe(true);
    await expect(verifyPassword('correct horse batterz', stored)).resolves.toBe(false);
  });

  it('normalizes unicode so visually identical passwords match', async () => {
    const stored = await hashPassword('contraseña-segura');
    // "ñ" written as n + combining tilde
    await expect(verifyPassword('contraseña-segura', stored)).resolves.toBe(true);
  });

  it('returns false for malformed hashes instead of throwing', async () => {
    await expect(verifyPassword('x', 'not-a-hash')).resolves.toBe(false);
    await expect(verifyPassword('x', DUMMY_PASSWORD_HASH)).resolves.toBe(false);
  });
});
