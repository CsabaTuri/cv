// The widget a visitor uses, against the real backend and a real database: the
// message has to reach the inbox, and an admin reply has to travel back to the
// visitor's open chat by itself (the widget polls).

import { expect, test } from '@playwright/test';
import { conversationWith, replyToVisitor, unique, visitorMessage } from './api';

test.describe('the visitor chat', () => {
  test('sends a message and shows it in the thread', async ({ page, request }) => {
    const message = unique('Szia, ez egy e2e üzenet');

    await page.goto('/');
    await page.getByTestId('chat-toggle').click();
    await expect(page.getByTestId('chat-panel')).toBeVisible();

    await page.getByTestId('chat-input').fill(message);
    await page.getByTestId('chat-send').click();

    const bubble = page.getByTestId('chat-message').filter({ hasText: message });
    await expect(bubble).toBeVisible();
    await expect(bubble).toHaveAttribute('data-role', 'visitor');

    // Not just on screen: it has to be in the database, in the conversation the
    // widget keeps in localStorage.
    const conversation = await conversationWith(request, message);
    const session = await page.evaluate(() => window.localStorage.getItem('cv-chat-session'));
    expect(session).toBeTruthy();
    expect(conversation.id).toBe(session);
  });

  test('keeps the send button disabled until something is typed', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('chat-toggle').click();

    await expect(page.getByTestId('chat-send')).toBeDisabled();
    await page.getByTestId('chat-input').fill('  ');
    await expect(page.getByTestId('chat-send')).toBeDisabled();

    await page.getByTestId('chat-input').fill('most már mehet');
    await expect(page.getByTestId('chat-send')).toBeEnabled();
  });

  test('receives an admin reply that was written somewhere else', async ({ page, request }) => {
    const message = unique('Válaszra vár');
    const answer = unique('Itt a válasz');
    const { sessionId } = await visitorMessage(request, message);

    // The visitor already has a session, so the widget continues that thread.
    await page.addInitScript((id) => {
      window.localStorage.setItem('cv-chat-session', id as string);
    }, sessionId);

    await page.goto('/');
    await page.getByTestId('chat-toggle').click();
    await expect(page.getByTestId('chat-message').filter({ hasText: message })).toBeVisible();

    const conversation = await conversationWith(request, message);
    await replyToVisitor(request, conversation.id, answer);

    const reply = page.getByTestId('chat-message').filter({ hasText: answer });
    await expect(reply).toBeVisible({ timeout: 15_000 });
    await expect(reply).toHaveAttribute('data-role', 'admin');
  });

  test('reports a failure instead of losing the message', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('chat-toggle').click();

    // The API is cut off; the widget has to say so rather than silently drop it.
    await page.route('**/api/chat', (route) => route.abort());
    await page.getByTestId('chat-input').fill(unique('Ennek el kell vesznie'));
    await page.getByTestId('chat-send').click();

    await expect(page.getByTestId('chat-error')).toBeVisible();
  });
});
