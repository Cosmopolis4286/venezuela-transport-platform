import { isIP } from 'node:net';

/**
 * The web server calls the API on behalf of the visitor, so without help the API sees every
 * visitor as the web server's own address and its per-IP limits (sign-in, token refresh, the
 * taxi tracking link) would be shared by everybody. These headers carry the visitor's address
 * and browser to the API, which trusts them only from its own proxy hops (API_TRUST_PROXY_HOPS).
 *
 * `trustedHops` is how many reverse proxies stand in front of the web server (WEB_TRUST_PROXY_HOPS:
 * 1 behind one Caddy). The visitor's address is the entry that many places from the end of
 * `X-Forwarded-For`; entries further left could be written by anyone and are ignored. With 0
 * (development, tests) nothing is forwarded.
 */
export function clientHeaders(
  incoming: Pick<Headers, 'get'>,
  trustedHops: number,
): Record<string, string> {
  const forwarded: Record<string, string> = {};
  const userAgent = incoming.get('user-agent');
  if (userAgent) forwarded['user-agent'] = userAgent.slice(0, 512);
  if (!Number.isInteger(trustedHops) || trustedHops < 1) return forwarded;
  const chain = (incoming.get('x-forwarded-for') ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const ip = chain[chain.length - trustedHops];
  if (ip && isIP(ip)) forwarded['x-forwarded-for'] = ip;
  return forwarded;
}

/** WEB_TRUST_PROXY_HOPS, read at call time (0 when unset or invalid). */
export function webTrustedHops(): number {
  const hops = Number(process.env.WEB_TRUST_PROXY_HOPS ?? 0);
  return Number.isInteger(hops) && hops >= 0 && hops <= 5 ? hops : 0;
}
