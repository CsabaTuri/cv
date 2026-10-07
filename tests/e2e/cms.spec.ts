// The site copy is editable without a rebuild: what the admin panel saves has
// to show up on the page. The test puts the original value back afterwards, so
// it can run against a live database without leaving a trace.

import { expect, test } from '@playwright/test';
import { ADMIN_TOKEN, contentMap, unique } from './api';

const KEY = 'skills.title';

test.describe('the copy editor', () => {
  test('a saved text appears on the site', async ({ page, request }) => {
    const original = (await contentMap(request))[KEY];
    expect(original, `${KEY} must exist in the catalogue`).toBeTruthy();

    const edited = unique('E2E által írt cím');

    try {
      await page.goto('/admin/');
      await page.getByTestId('admin-token').fill(ADMIN_TOKEN);
      await page.getByTestId('admin-login').click();
      await page.getByTestId('tab-content').click();

      const field = page.locator(`[data-testid="field"][data-key="${KEY}"]`);
      await field.fill(edited);
      await page.getByTestId('content-save').click();
      await expect(page.getByTestId('content-saved')).toBeVisible();

      // Stored, and rendered on the page without a rebuild.
      expect((await contentMap(request))[KEY]).toBe(edited);

      await page.goto('/');
      await expect(page.getByRole('heading', { level: 2, name: edited })).toBeVisible();
    } finally {
      await request.put('/api/admin/content', {
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
        data: { values: { [KEY]: original } },
      });
    }

    expect((await contentMap(request))[KEY]).toBe(original);
  });

  test('keeps an invalid JSON field out of the database', async ({ page, request }) => {
    const key = 'hero.roles';
    const original = (await contentMap(request))[key];

    try {
      await page.goto('/admin/');
      await page.getByTestId('admin-token').fill(ADMIN_TOKEN);
      await page.getByTestId('admin-login').click();
      await page.getByTestId('tab-content').click();

      await page.locator(`[data-testid="field"][data-key="${key}"]`).fill('not json at all');
      await page.getByTestId('content-save').click();

      await expect(page.getByText('Hibás JSON az egyik mezőben.')).toBeVisible();
      expect((await contentMap(request))[key]).toBe(original);
    } finally {
      await request.put('/api/admin/content', {
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
        data: { values: { [key]: original } },
      });
    }
  });
});
