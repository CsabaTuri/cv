// The admin panel: the token gate, the inbox, and the reply that has to end up
// in the visitor's conversation.

import { expect, test } from '@playwright/test';
import { ADMIN_TOKEN, contentMap, unique, visitorMessage } from './api';

async function signIn(page: import('@playwright/test').Page, token: string) {
  await page.goto('/admin/');
  await page.getByTestId('admin-token').fill(token);
  await page.getByTestId('admin-login').click();
}

test.describe('the admin panel', () => {
  test('refuses a token that is not the one in the environment', async ({ page }) => {
    await signIn(page, 'definitely-not-the-token');

    await expect(page.getByTestId('admin-error')).toBeVisible();
    await expect(page.getByTestId('tab-inbox')).toHaveCount(0);
    await expect(page.getByTestId('admin-token')).toBeVisible();
  });

  test('lists a new visitor message as unread and answers it', async ({ page, request }) => {
    const message = unique('Adminnak szánt üzenet');
    const answer = unique('Admin válasza');
    await visitorMessage(request, message);

    await signIn(page, ADMIN_TOKEN);
    await expect(page.getByTestId('tab-inbox')).toBeVisible();

    const row = page.getByTestId('conversation').filter({ hasText: message });
    await expect(row).toBeVisible();
    await expect(row.getByTestId('unread')).toBeVisible();

    await row.click();
    await expect(page.getByTestId('inbox-message').filter({ hasText: message })).toBeVisible();

    await page.getByTestId('reply-input').fill(answer);
    await page.getByTestId('reply-send').click();

    // The reply is in the thread, and reading the conversation cleared its badge.
    await expect(page.getByTestId('inbox-message').filter({ hasText: answer })).toBeVisible();
    await expect(
      page.getByTestId('conversation').filter({ hasText: message }).getByTestId('unread'),
    ).toHaveCount(0);
  });

  test('forgets the token when signing out', async ({ page }) => {
    await signIn(page, ADMIN_TOKEN);
    await expect(page.getByTestId('tab-inbox')).toBeVisible();

    await page.getByTestId('admin-signout').click();

    await expect(page.getByTestId('admin-token')).toBeVisible();
    expect(
      await page.evaluate(() => window.localStorage.getItem('cv-chat-admin-token')),
    ).toBeNull();
  });

  test('opens the copy editor with the fields of the catalogue', async ({ page, request }) => {
    const content = await contentMap(request);
    await signIn(page, ADMIN_TOKEN);
    await page.getByTestId('tab-content').click();

    await expect(page.getByTestId('content-save')).toBeVisible();
    expect(await page.getByTestId('field').count()).toBeGreaterThan(50);
    // The editor shows what the database holds, not a hardcoded default.
    await expect(page.locator('[data-testid="field"][data-key="hero.name"]')).toHaveValue(
      content['hero.name'],
    );
  });
});
