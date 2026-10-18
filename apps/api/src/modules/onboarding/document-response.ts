import { StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import type { DocumentDownload } from './onboarding.service.js';

/** Always a download (never rendered inline), never cached by browsers or proxies. */
export function sendDocument(res: Response, file: DocumentDownload): StreamableFile {
  res.set({
    'Content-Type': file.contentType,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    'Cache-Control': 'no-store',
  });
  return new StreamableFile(file.stream);
}
