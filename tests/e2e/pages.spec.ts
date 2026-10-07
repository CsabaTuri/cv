// The exported site itself: the copy really comes from the database, the
// unknown-path document behaves like nginx serves it, and the PWA metadata is
// in the HTML.

import { expect, test } from '@playwright/test';
import { contentMap } from './api';

test.describe('the CV page', () => {
  test('renders the copy stored in the database', async ({ page, request }) => {
    const content = await contentMap(request);
    await page.goto('/');

    // Baked-in text would still show up without the database, so the check is
    // against what the API returns right now.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(content['hero.name']);
    await expect(
      page.getByRole('heading', { level: 2, name: content['about.title'] }),
    ).toBeVisible();
  });

  test('uses the stored title and description in the document head', async ({ page, request }) => {
    const content = await contentMap(request);
    await page.goto('/');

    await expect(page).toHaveTitle(content['metadata.title']);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      content['metadata.description'],
    );
  });

  test('points the manifest at the installable app', async ({ page }) => {
    await page.goto('/');

    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();

    const manifest = await page.request.get(href as string);
    expect(manifest.status()).toBe(200);
    expect(manifest.headers()['content-type']).toContain('application/manifest+json');

    const app = (await manifest.json()) as { name: string; icons: { src: string }[] };
    expect(app.name).toBeTruthy();
    expect(app.icons.length).toBeGreaterThan(1);
  });

  test('serves an unknown path as the 404 document', async ({ page }) => {
    const response = await page.goto('/nincs-ilyen-utvonal');

    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // The link back home is a client-side one (next/link), so it has to work.
    await page.getByRole('link').first().click();
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe('the admin page', () => {
  test('asks for the token before showing anything', async ({ page }) => {
    await page.goto('/admin/');

    await expect(page.getByTestId('admin-token')).toBeVisible();
    await expect(page.getByTestId('admin-login')).toBeVisible();
    await expect(page.getByTestId('tab-inbox')).toHaveCount(0);
  });
});
