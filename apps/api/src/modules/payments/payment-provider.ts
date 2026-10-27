import type { PaymentCurrency, PaymentMethod } from '@vtp/shared-types';

export interface PaymentInstructionInput {
  method: PaymentMethod;
  amount: string;
  currency: PaymentCurrency;
  reference: string;
}

/**
 * One adapter per way money reaches the platform (a bank or gateway for pago móvil and transfers,
 * a PIX institution, a USDT wallet watcher). It tells the payer where to send the money; when the
 * money arrives, the adapter (webhook or poller) calls `PaymentsService.receive`. Credentials live
 * in server-side configuration only.
 */
export interface PaymentProvider {
  readonly name: string;
  supports(method: PaymentMethod): boolean;
  instructions(input: PaymentInstructionInput): { label: string; value: string }[];
}

export const PAYMENT_PROVIDERS = Symbol('PAYMENT_PROVIDERS');

/**
 * Development and tests only: fake accounts, and the payer confirms with
 * `POST /me/payments/:id/simulate`. The configuration refuses it in production.
 */
export class SimulatedPaymentProvider implements PaymentProvider {
  readonly name = 'simulated';

  supports(): boolean {
    return true;
  }

  instructions({ method, reference }: PaymentInstructionInput): { label: string; value: string }[] {
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
