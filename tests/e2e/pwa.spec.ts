// The installable app: the worker registers, takes control, answers with the
// cached shell when the network is gone, and keeps the API out of the caches.

import { expect, test } from '@playwright/test';

/** The paths of every URL the worker has cached. */
async function cachedPaths(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) urls.push(new URL(request.url).pathname);
    }
    return urls;
  });
}

/** Waits until the worker of this page is in charge of it. */
async function controlled(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));

  // A worker only controls the loads that happen after it activated.
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
}

test.describe('the service worker', () => {
  test('registers and takes control of the page', async ({ page }) => {
    await controlled(page);

    const scope = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return registration.scope;
    });
    expect(scope).toContain('/');
  });

  test('serves the cached shell when the network is gone', async ({ page, context }) => {
    await controlled(page);

    // The install step fetches the shell and the hashed assets; wait for that
    // to have happened before pulling the plug.
    await expect.poll(() => cachedPaths(page)).toContain('/');
    expect(
      (await cachedPaths(page)).filter((path) => path.startsWith('/_next/')).length,
    ).toBeGreaterThan(0);

    await context.setOffline(true);
    const response = await page.reload();

    expect(response?.status()).toBe(200);
    await expect(page.getByTestId('chat-toggle')).toBeVisible();
  });

  test('keeps the API out of the caches', async ({ page }) => {
    await controlled(page);

    // Opening the widget makes the page talk to the API, which is exactly what
    // must stay uncached.
    await Promise.all([
      page.waitForResponse((response) => response.url().includes('/api/chat/messages')),
      page.getByTestId('chat-toggle').click(),
    ]);

    expect((await cachedPaths(page)).filter((path) => path.startsWith('/api/'))).toEqual([]);
  });
});
