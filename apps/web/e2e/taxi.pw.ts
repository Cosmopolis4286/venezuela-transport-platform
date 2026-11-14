import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { SEED_FILE, type Seed } from './support/seed';

// A taxi line serves the origin terminal (e2e/support/seed.ts).
const seed = () => JSON.parse(readFileSync(SEED_FILE, 'utf8')) as Seed;

test('staff ask for a taxi for a WhatsApp customer, who follows and cancels it by link', async ({
  page,
}, info) => {
  const s = seed();
  const customer = `Carmen ${info.project.name} ${Date.now() % 100_000}`;
  await page.goto('/login?next=/admin/taxi');
  await page.getByRole('tab', { name: 'Con contraseña' }).click();
  await page.getByLabel('Correo').fill(s.reviewerEmail);
  await page.getByLabel('Contraseña').fill(s.password);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByRole('heading', { name: 'Taxis y mototaxis por WhatsApp' })).toBeVisible();
  await page.getByLabel('Nombre del cliente').fill(customer);
  await page.getByLabel('Teléfono (WhatsApp)').fill('0416-5551234');
  await page.getByLabel('Viaje').selectOption('to_terminal');
  await page
    .getByLabel('Terminal', { exact: true })
    .selectOption({ label: `${s.originName} · Caracas` });
  await page.getByLabel(/Dirección/).fill('Calle Bolívar, frente a la plaza');
  await page.getByRole('button', { name: 'Pedir' }).click();
  await expect(page.getByText('Pedido enviado a los conductores.')).toBeVisible();

  const row = page.getByRole('listitem').filter({ hasText: customer });
  await expect(row).toContainText(`Taxi · Calle Bolívar, frente a la plaza → ${s.originName}`);
  await expect(row.getByRole('link', { name: 'Escribirle por WhatsApp' })).toHaveAttribute(
    'href',
    /^https:\/\/wa\.me\/584165551234\?text=.*viaje%20en%20taxi/,
  );
  const tracking = await row
    .getByRole('link', { name: 'Ver lo que ve el cliente' })
    .getAttribute('href');
  const token = tracking!.split('/').pop()!;

  // The link without a language goes to the visitor's; no account needed.
  await page.context().clearCookies();
  await page.goto(`/taxi/${token}`);
  await expect(page).toHaveURL(new RegExp(`/(es|en|pt-br)/taxi/${token}$`));
  await page.goto(`/es/taxi/${token}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Taxi');
  await expect(page.getByText('Estamos buscando quien te lleve.')).toBeVisible();
  await expect(page.getByText(s.originName)).toBeVisible();
  await expect(page.getByText('5551234')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancelar el viaje' }).click();
  await expect(page.getByText('Este viaje fue cancelado.')).toBeVisible();
});
