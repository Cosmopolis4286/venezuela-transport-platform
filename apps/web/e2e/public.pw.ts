import { expect, test } from '@playwright/test';

test('the home page is translated and links to the legal documents', async ({ page }) => {
  await page.goto('/es');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Viaja por Venezuela en autobús o por puesto' }),
  ).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Información legal' })
    .getByRole('link', { name: 'Términos y condiciones' })
    .click();
  await expect(page).toHaveURL(/\/es\/legal\/terminos$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Términos');
  await expect(page.getByText('Versión preliminar')).toBeVisible();

  await page.goto('/en');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Travel around Venezuela by bus or shared car' }),
  ).toBeVisible();
});

test('every legal page renders', async ({ page }) => {
  for (const slug of [
    'terminos',
    'privacidad',
    'cancelacion-y-reembolsos',
    'condiciones-para-empresas',
    'cookies',
  ]) {
    const response = await page.goto(`/es/legal/${slug}`);
    expect(response?.status(), slug).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Placeholders are always replaced (empresa.json).
    await expect(page.locator('main')).not.toContainText('{{');
  }
});

test('pages send the security headers', async ({ page }) => {
  const response = await page.goto('/es');
  const headers = response!.headers();
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-powered-by']).toBeUndefined();
});
