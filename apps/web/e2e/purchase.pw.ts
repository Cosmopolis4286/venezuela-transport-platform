import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { SEED_FILE, type Seed } from './support/seed';

// Data created by e2e/support/seed.ts (globalSetup): a company with a daily departure and a
// passenger who booked and paid one seat for tomorrow.
const seed = () => JSON.parse(readFileSync(SEED_FILE, 'utf8')) as Seed;

test('the public search lists the departure with its price and free seats', async ({ page }) => {
  const s = seed();
  await page.goto(`/es/buscar?from=${s.originId}&to=${s.destinationId}&date=${s.serviceDate}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Caracas → Valencia');
  const card = page.getByRole('listitem').filter({ hasText: s.originName });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('11 de 12 puestos libres');
  await expect(card).toContainText('15');
});

test('the company sees the paid booking in its passenger list', async ({ page }) => {
  const s = seed();
  await page.goto(
    `/login?next=/portal/organizations/${s.organizationId}/trips?date=${s.serviceDate}`,
  );
  await page.getByRole('tab', { name: 'Con contraseña' }).click();
  await page.getByLabel('Correo').fill(s.ownerEmail);
  await page.getByLabel('Contraseña').fill(s.password);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByRole('heading', { name: 'Viajes y pasajeros' })).toBeVisible();
  await expect(page.getByText('1 vendidos · 0 apartados · 11 libres de 12')).toBeVisible();
  await page.getByRole('link', { name: 'Lista de pasajeros' }).click();

  await expect(page.getByText('Lista de pasajeros (1)')).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: s.passengerLastName });
  await expect(row).toContainText('V-18765432');
  await expect(row).toContainText('Caracas → Valencia');
});
