const RIF_PATTERN = /^([JGVEPC])-?(\d{8})-?(\d)$/i;

/**
 * Normalizes a Venezuelan RIF to `J-12345678-9`. Validates the format only; the check digit is
 * verified by a reviewer against SENIAT documents during KYC.
 */
export function normalizeRif(input: string): string | null {
  const match = RIF_PATTERN.exec(input.trim().replace(/\s+/g, ''));
  if (!match) return null;
  const [, letter, number, check] = match;
  return `${letter!.toUpperCase()}-${number}-${check}`;
}
