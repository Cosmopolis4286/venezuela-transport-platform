/**
 * Legal documents (docs/legal). Users accept `LEGAL_VERSION` of the Terms and the Privacy Policy;
 * when it changes, the apps and the portal ask them to accept the new one. Keep it equal to
 * `version` in docs/legal/empresa.json (a test checks it).
 */
export const LEGAL_VERSION = '2026-11-12';

/** Public pages of the legal documents: `/{lang}/legal/{slug}` on the website. */
export const LEGAL_PAGES = {
  terms: 'terminos',
  privacy: 'privacidad',
  refunds: 'cancelacion-y-reembolsos',
  operators: 'condiciones-para-empresas',
  cookies: 'cookies',
} as const;
export type LegalPage = (typeof LEGAL_PAGES)[keyof typeof LEGAL_PAGES];

/** `POST /me/terms` — accepts the current Terms and Privacy Policy. */
export interface AcceptTermsRequest {
  version: string;
}
