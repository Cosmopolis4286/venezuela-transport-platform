import { describe, expect, it } from 'vitest';
import { clientHeaders } from './client-headers';

const headers = (values: Record<string, string>) => new Headers(values);

describe('clientHeaders', () => {
  it('forwards nothing but the browser without trusted proxies', () => {
    expect(
      clientHeaders(headers({ 'x-forwarded-for': '1.2.3.4', 'user-agent': 'Firefox' }), 0),
    ).toEqual({ 'user-agent': 'Firefox' });
  });

  it('takes the address the nearest trusted proxy saw, not what the visitor wrote', () => {
    const spoofed = headers({ 'x-forwarded-for': '9.9.9.9, 200.44.1.7' });
    expect(clientHeaders(spoofed, 1)).toEqual({ 'x-forwarded-for': '200.44.1.7' });
    expect(clientHeaders(spoofed, 2)).toEqual({ 'x-forwarded-for': '9.9.9.9' });
    expect(clientHeaders(headers({ 'x-forwarded-for': '2800:3f0::1' }), 1)).toEqual({
      'x-forwarded-for': '2800:3f0::1',
    });
  });

  it('ignores missing, short or invalid chains', () => {
    expect(clientHeaders(headers({}), 1)).toEqual({});
    expect(clientHeaders(headers({ 'x-forwarded-for': '1.2.3.4' }), 2)).toEqual({});
    expect(clientHeaders(headers({ 'x-forwarded-for': 'evil, <script>' }), 1)).toEqual({});
  });
});
