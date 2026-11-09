import { HttpStatus } from '@nestjs/common';
import type { FiscalSettings, InvoiceIssuerKind, IssueInvoiceRequest } from '@vtp/shared-types';
import { ApiException } from '../../common/errors/api.exception.js';
import type { InvoiceRow } from './fiscal.schema.js';

/** What the issuer assigned to a document. */
export interface IssuedNumbers {
  number: string;
  controlNumber: string;
  /** The provider's id for the document, when there is one. */
  reference: string | null;
}

/**
 * Who assigns the invoice and control numbers (ADR-031). `draft`: staff issue each document in
 * the SENIAT portal and type its numbers. An authorized digital printer is a new adapter that
 * calls its API here; nothing else changes.
 */
export interface InvoiceIssuer {
  readonly kind: InvoiceIssuerKind;
  /** Rejects a request that cannot be issued, before anything else is checked. */
  validate(request: IssueInvoiceRequest): void;
  issue(
    invoice: InvoiceRow,
    settings: FiscalSettings,
    request: IssueInvoiceRequest,
  ): Promise<IssuedNumbers>;
}

export const INVOICE_ISSUER = Symbol('INVOICE_ISSUER');

const required = (message: string) =>
  new ApiException('VALIDATION_FAILED', message, HttpStatus.BAD_REQUEST);

export class DraftInvoiceIssuer implements InvoiceIssuer {
  readonly kind = 'draft' as const;

  validate(request: IssueInvoiceRequest) {
    if (!request.number?.trim() || !request.controlNumber?.trim()) {
      throw required('Type the invoice number and control number the SENIAT portal assigned');
    }
  }

  issue(_invoice: InvoiceRow, _settings: FiscalSettings, request: IssueInvoiceRequest) {
    this.validate(request);
    return Promise.resolve({
      number: request.number!.trim(),
      controlNumber: request.controlNumber!.trim(),
      reference: null,
    });
  }
}

/**
 * Placeholder until a digital printer is contracted: its adapter goes here, configured with its
 * own server-side variables (see docs/architecture/fiscal.md).
 */
export class UnconfiguredDigitalPrinter implements InvoiceIssuer {
  readonly kind = 'digital_printer' as const;

  validate() {}

  issue(): Promise<IssuedNumbers> {
    return Promise.reject(
      new ApiException(
        'SERVICE_UNAVAILABLE',
        'No digital printer is configured yet; use INVOICE_ISSUER=draft',
        HttpStatus.SERVICE_UNAVAILABLE,
      ),
    );
  }
}
