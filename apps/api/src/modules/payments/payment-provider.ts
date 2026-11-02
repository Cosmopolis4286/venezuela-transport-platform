import {
  PAYMENT_ACCOUNT_FIELDS,
  PAYMENT_METHODS,
  type PaymentCurrency,
  type PaymentMethod,
} from '@vtp/shared-types';
import { and, eq, isNull } from 'drizzle-orm';
import type { DatabaseService } from '../../database/database.service.js';
import { paymentAccounts } from './payments.schema.js';

export interface PaymentInstructionInput {
  method: PaymentMethod;
  amount: string;
  currency: PaymentCurrency;
  reference: string;
}

export type InstructionLine = { label: string; value: string };

/**
 * How money reaches the platform. An automatic adapter (a bank or gateway for pago móvil and
 * transfers, a PIX institution, a USDT wallet watcher) tells the payer where to send the money and
 * calls `PaymentsService.receive` when it arrives (webhook or poller). The `manual` provider shows
 * the platform's own accounts; the payer reports the operation number and staff confirm it
 * (ADR-027). Credentials live in server-side configuration only.
 */
export interface PaymentProvider {
  readonly name: string;
  /** People verify its payments: after paying, the payer reports the operation number. */
  readonly manual: boolean;
  /** Methods it can take now. */
  methods(): Promise<PaymentMethod[]>;
  /** Where to send the money; null when the method stopped being available. */
  instructions(input: PaymentInstructionInput): Promise<InstructionLine[] | null>;
}

/** The active provider, or null when online payment is off (`PAYMENT_PROVIDER=disabled`). */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

/** The platform's receiving accounts (`/admin/payment-accounts`); staff verify each payment. */
export class ManualPaymentProvider implements PaymentProvider {
  readonly name = 'manual';
  readonly manual = true;

  constructor(private readonly database: DatabaseService) {}

  async methods(): Promise<PaymentMethod[]> {
    const rows = await this.database.db
      .select({ method: paymentAccounts.method })
      .from(paymentAccounts)
      .where(and(isNull(paymentAccounts.organizationId), eq(paymentAccounts.active, true)));
    return rows.map((r) => r.method);
  }

  async instructions({
    method,
    reference,
  }: PaymentInstructionInput): Promise<InstructionLine[] | null> {
    const [account] = await this.database.db
      .select()
      .from(paymentAccounts)
      .where(
        and(
          isNull(paymentAccounts.organizationId),
          eq(paymentAccounts.method, method),
          eq(paymentAccounts.active, true),
        ),
      );
    if (!account) return null;
    return [
      ...PAYMENT_ACCOUNT_FIELDS[method].map(({ key, label }) => ({
        label,
        value: account.fields[key] ?? '',
      })),
      { label: method === 'usdt' ? 'Memo' : 'Concepto o referencia', value: reference },
    ];
  }
}

/**
 * Development and tests only: fake accounts, and the payer confirms with
 * `POST /me/payments/:id/simulate`. The configuration refuses it in production.
 */
export class SimulatedPaymentProvider implements PaymentProvider {
  readonly name = 'simulated';
  readonly manual = false;

  async methods(): Promise<PaymentMethod[]> {
    return [...PAYMENT_METHODS];
  }

  async instructions({ method, reference }: PaymentInstructionInput): Promise<InstructionLine[]> {
    const concept = { label: 'Concepto o referencia', value: reference };
    switch (method) {
      case 'pago_movil':
        return [
          { label: 'Banco', value: '0000 – Banco Simulado' },
          { label: 'Teléfono', value: '0414-000-0000' },
          { label: 'RIF', value: 'J-00000000-0' },
          concept,
        ];
      case 'bank_transfer':
        return [
          { label: 'Banco', value: '0000 – Banco Simulado' },
          { label: 'Cuenta', value: '0000-0000-00-0000000000' },
          { label: 'Titular', value: 'VTP Simulado, C.A.' },
          { label: 'RIF', value: 'J-00000000-0' },
          concept,
        ];
      case 'pix':
        return [
          { label: 'Chave PIX', value: 'pagos@simulado.invalid' },
          { label: 'Favorecido', value: 'VTP Simulado' },
          concept,
        ];
      case 'usdt':
        return [
          { label: 'Red', value: 'TRON (TRC-20)' },
          { label: 'Dirección', value: 'T000000000000000000000SIMULADO000' },
          { label: 'Memo', value: reference },
        ];
    }
  }
}
