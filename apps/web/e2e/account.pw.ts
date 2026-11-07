import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('register with e-mail and password, sign out and sign in again', async ({ page }) => {
  const email = `pw-${randomUUID().slice(0, 8)}@example.test`;
  const password = 'una frase larga de prueba';

  await page.goto('/register');
  await page.getByLabel('Nombre').fill('Rosa');
  await page.getByLabel('Apellido').fill('Prueba');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  // The terms checkbox is required: the form does not submit without it.
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/register/);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/portal/);

  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.getByRole('tab', { name: 'Con contraseña' }).click();
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill('una contraseña equivocada');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Correo o contraseña incorrectos.')).toBeVisible();

  // React resets the form after a failed submission.
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/portal/);
});
