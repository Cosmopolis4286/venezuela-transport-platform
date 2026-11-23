import { ApiError } from '@vtp/mobile-core';

/** Without an answer by then, the phone works as if there were no signal. */
export const ONLINE_TIMEOUT_MS = 8000;

class NoAnswer extends Error {}

/** `promise`, or a failure that {@link noSignal} recognises after `ms` without an answer. */
export const withTimeout = <T>(promise: Promise<T>, ms = ONLINE_TIMEOUT_MS) =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new NoAnswer()), ms)),
  ]);

/** The request never reached the API, or got no answer in time. */
export const noSignal = (e: unknown) =>
  e instanceof NoAnswer || (e instanceof ApiError && e.code === 'NETWORK');
