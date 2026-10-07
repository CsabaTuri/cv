// Shared helpers for the end-to-end specs. Everything goes through the same
// origin the browser uses, so the proxy rules are exercised too.

import { expect, type APIRequestContext } from '@playwright/test';

export const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? 'ci-admin-token';
export const ADMIN_HEADERS = { authorization: `Bearer ${ADMIN_TOKEN}` };

/** A value that cannot clash with another run or another test. */
export function unique(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

export function sessionId(): string {
  return crypto.randomUUID();
}

export async function contentMap(request: APIRequestContext): Promise<Record<string, string>> {
  const response = await request.get('/api/content');
  expect(response.ok(), 'GET /api/content').toBeTruthy();

  const body = (await response.json()) as { content?: Record<string, string> };
  return body.content ?? {};
}

export async function saveContent(
  request: APIRequestContext,
  values: Record<string, string>,
): Promise<void> {
  const response = await request.put('/api/admin/content', {
    headers: ADMIN_HEADERS,
    data: { values },
  });
  expect(response.ok(), 'PUT /api/admin/content').toBeTruthy();
}

/** Writes a visitor message through the API and returns its conversation id. */
export async function visitorMessage(
  request: APIRequestContext,
  message: string,
  id: string = sessionId(),
): Promise<{ sessionId: string; messageId: number }> {
  const response = await request.post('/api/chat', { data: { sessionId: id, message } });
  expect(response.status(), 'POST /api/chat').toBe(201);

  const body = (await response.json()) as { sessionId: string; message: { id: number } };
  return { sessionId: body.sessionId, messageId: body.message.id };
}

type Conversation = {
  id: string;
  number: number;
  unread: number;
  messageCount: number;
  lastMessage: { role: string; body: string } | null;
};

export async function conversations(request: APIRequestContext): Promise<Conversation[]> {
  const response = await request.get('/api/admin/conversations', { headers: ADMIN_HEADERS });
  expect(response.ok(), 'GET /api/admin/conversations').toBeTruthy();

  const body = (await response.json()) as { conversations: Conversation[] };
  return body.conversations;
}

/** Waits until the message shows up in the admin list, then returns its row. */
export async function conversationWith(
  request: APIRequestContext,
  message: string,
): Promise<Conversation> {
  let found: Conversation | undefined;

  await expect
    .poll(
      async () => {
        found = (await conversations(request)).find((item) => item.lastMessage?.body === message);
        return found?.id;
      },
      { message: `conversation with: ${message}`, timeout: 10_000 },
    )
    .toBeTruthy();

  return found as Conversation;
}

export async function replyToVisitor(
  request: APIRequestContext,
  conversationId: string,
  message: string,
): Promise<void> {
  const response = await request.post(`/api/admin/conversations/${conversationId}/reply`, {
    headers: ADMIN_HEADERS,
    data: { message },
  });
  expect(response.status(), 'POST reply').toBe(201);
}
