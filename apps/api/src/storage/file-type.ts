import type { DocumentContentType } from '@vtp/shared-types';

/**
 * Detects the real format from the first bytes ("magic numbers"). The client-supplied
 * Content-Type and file name are never trusted.
 */
export function detectDocumentType(content: Buffer): DocumentContentType | null {
  if (content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (content.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}

export const EXTENSION_FOR: Record<DocumentContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};
