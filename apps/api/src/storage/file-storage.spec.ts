import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { text } from 'node:stream/consumers';
import { LocalFileStorage } from './file-storage.js';
import { detectDocumentType } from './file-type.js';

describe('LocalFileStorage', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'vtp-storage-'));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('stores, reads and deletes files', async () => {
    const storage = new LocalFileStorage(dir);
    await storage.put('kyc/abc/file.pdf', Buffer.from('%PDF-1.7 hello'), 'application/pdf');
    expect(await text(await storage.read('kyc/abc/file.pdf'))).toBe('%PDF-1.7 hello');
    await storage.delete('kyc/abc/file.pdf');
    await expect(text(await storage.read('kyc/abc/file.pdf'))).rejects.toThrow();
  });

  it('never overwrites an existing key', async () => {
    const storage = new LocalFileStorage(dir);
    await storage.put('kyc/once.pdf', Buffer.from('a'), 'application/pdf');
    await expect(
      storage.put('kyc/once.pdf', Buffer.from('b'), 'application/pdf'),
    ).rejects.toThrow();
  });

  it.each(['../etc/passwd', '/abs/path', 'kyc/../../x', 'Kyc/Upper', 'a b'])(
    'rejects unsafe key %j',
    async (key) => {
      const storage = new LocalFileStorage(dir);
      await expect(storage.put(key, Buffer.from('x'), 'text/plain')).rejects.toThrow(/Unsafe/);
    },
  );
});

describe('detectDocumentType', () => {
  it('recognizes JPEG, PNG and PDF by content', () => {
    expect(detectDocumentType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe('image/jpeg');
    expect(
      detectDocumentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])),
    ).toBe('image/png');
    expect(detectDocumentType(Buffer.from('%PDF-1.4\n'))).toBe('application/pdf');
  });

  it('rejects anything else, including disguised files', () => {
    expect(detectDocumentType(Buffer.from('<html><script>alert(1)</script>'))).toBeNull();
    expect(detectDocumentType(Buffer.from('MZ\x90\x00'))).toBeNull();
    expect(detectDocumentType(Buffer.alloc(0))).toBeNull();
  });
});
