'use server';

import { refresh } from 'next/cache';
import type { FormState } from '@/lib/form-state';
import { apiRequest } from '@/lib/server/api';
import { failure, text } from '@/lib/server/form-actions';

const decimal = (form: FormData, name: string) => text(form, name).replace(',', '.');
const id = (form: FormData, name: string) => encodeURIComponent(text(form, name));

export async function saveFiscalSettings(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest('/admin/fiscal/settings', {
      method: 'PUT',
      body: {
        legalName: text(form, 'legalName'),
        rif: text(form, 'rif'),
        fiscalAddress: text(form, 'fiscalAddress'),
        taxpayerType: text(form, 'taxpayerType'),
        vatRate: decimal(form, 'vatRate'),
      },
    });
  } catch (error) {
    return failure(error, {
      VALIDATION_FAILED:
        'Revisa los datos: el RIF va como V-12345678-9 o J-12345678-9 y el IVA entre 0 y 99.',
    });
  }
  refresh();
  return { success: 'Datos fiscales guardados.' };
}

export async function saveBcvRate(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest('/admin/fiscal/bcv-rates', {
      method: 'PUT',
      body: { date: text(form, 'date'), unitsPerUsd: decimal(form, 'unitsPerUsd') },
    });
  } catch (error) {
    return failure(error, {
      VALIDATION_FAILED: 'Indica una fecha que no sea futura y la tasa en bolívares por dólar.',
    });
  }
  refresh();
  return { success: 'Tasa BCV guardada.' };
}

export async function issueInvoice(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest(`/admin/fiscal/invoices/${id(form, 'invoiceId')}/issue`, {
      method: 'POST',
      body: {
        number: text(form, 'number') || undefined,
        controlNumber: text(form, 'controlNumber') || undefined,
        issuedOn: text(form, 'issuedOn') || undefined,
      },
    });
  } catch (error) {
    return failure(error, {
      VALIDATION_FAILED:
        'Escribe el número de factura y el número de control que asignó el portal del SENIAT, y una fecha que no sea futura.',
    });
  }
  refresh();
  return { success: 'Documento emitido.' };
}

export async function updateInvoiceBuyer(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest(`/admin/fiscal/invoices/${id(form, 'invoiceId')}/buyer`, {
      method: 'PATCH',
      body: {
        name: text(form, 'name'),
        idType: text(form, 'idType'),
        idNumber: text(form, 'idNumber'),
        address: text(form, 'address') || null,
      },
    });
  } catch (error) {
    return failure(error, {
      VALIDATION_FAILED: 'Revisa el nombre y la cédula o RIF del comprador.',
    });
  }
  refresh();
  return { success: 'Comprador actualizado.' };
}

export async function voidInvoice(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest(`/admin/fiscal/invoices/${id(form, 'invoiceId')}/void`, {
      method: 'POST',
      body: { reason: text(form, 'reason') },
    });
  } catch (error) {
    return failure(error, { VALIDATION_FAILED: 'Indica el motivo de la anulación.' });
  }
  refresh();
  return { success: 'Documento anulado.' };
}

export async function createPurchase(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest('/admin/fiscal/purchases', {
      method: 'POST',
      body: {
        date: text(form, 'date'),
        supplierRif: text(form, 'supplierRif'),
        supplierName: text(form, 'supplierName'),
        invoiceNumber: text(form, 'invoiceNumber'),
        controlNumber: text(form, 'controlNumber'),
        base: decimal(form, 'base') || '0',
        exempt: decimal(form, 'exempt') || '0',
        vatRate: decimal(form, 'vatRate') || '0',
        vat: decimal(form, 'vat') || '0',
      },
    });
  } catch (error) {
    return failure(error, {
      VALIDATION_FAILED:
        'Revisa la compra: RIF del proveedor, números de factura y control, y los montos en bolívares.',
    });
  }
  refresh();
  return { success: 'Compra registrada.' };
}

export async function deletePurchase(_: FormState, form: FormData): Promise<FormState> {
  try {
    await apiRequest(`/admin/fiscal/purchases/${id(form, 'purchaseId')}`, { method: 'DELETE' });
  } catch (error) {
    return failure(error);
  }
  refresh();
  return {};
}
