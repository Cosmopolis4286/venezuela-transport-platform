import { ExpoPushSender } from './push-sender.js';

describe('ExpoPushSender', () => {
  it('posts batches to the Expo push service and reports uninstalled apps', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const batch = JSON.parse(init.body as string) as { to: string }[];
      return new Response(
        JSON.stringify({
          data: batch.map((m) =>
            m.to.includes('gone')
              ? { status: 'error', details: { error: 'DeviceNotRegistered' } }
              : { status: 'ok', id: 'x' },
          ),
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const messages = Array.from({ length: 150 }, (_, i) => ({
      to: i === 120 ? 'ExponentPushToken[gone]' : `ExponentPushToken[t${i}]`,
      title: 'Hola',
      body: 'Mensaje',
    }));
    const result = await new ExpoPushSender('secret-token', fakeFetch).send(messages);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toBe('https://exp.host/--/api/v2/push/send');
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe(
      'Bearer secret-token',
    );
    expect(JSON.parse(calls[1]!.init.body as string)).toHaveLength(50);
    expect(result.invalidTokens).toEqual(['ExponentPushToken[gone]']);
  });

  it('fails loudly when the service is down, so the notice is logged as failed', async () => {
    const down = (async () => new Response('nope', { status: 502 })) as unknown as typeof fetch;
    await expect(
      new ExpoPushSender('', down).send([{ to: 'ExponentPushToken[a1]', title: 't', body: 'b' }]),
    ).rejects.toThrow(/502/);
  });
});
