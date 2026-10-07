'use client';

// ---------------------------------------------------------------------------
// Client side of the push notifications.
//
// A subscription belongs to one browser and to one audience:
//   * `visitor` - tied to the visitor's chat session, notified when an admin
//     replies;
//   * `admin`   - tied to the admin token, notified when a visitor writes.
//
// The public VAPID key comes from the API rather than the build, so it can be
// rotated without rebuilding the site.
// ---------------------------------------------------------------------------

export type PushAudience = 'admin' | 'visitor';

export type PushError =
  'unsupported' | 'blocked' | 'denied' | 'unavailable' | 'subscribe-failed' | 'server-failed';

export interface PushResult {
  ok: boolean;
  reason?: PushError;
}

const API = '/api/push';

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission;
}

// The API answers with the base64url form of an uncompressed P-256 key.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalised);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registration();
  if (!reg) return null;
  return (await reg.pushManager.getSubscription()) ?? null;
}

async function publicKey(): Promise<string | null> {
  try {
    const response = await fetch(`${API}/public-key`, { cache: 'no-store' });
    if (!response.ok) return null;
    const data = (await response.json()) as { key?: string | null };
    return data.key ?? null;
  } catch {
    return null;
  }
}

function subscriptionPayload(subscription: PushSubscription) {
  const json = subscription.toJSON() as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };

  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return null;

  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
}

// Must be called from a user gesture: the browser only asks for the
// notification permission in response to a click.
export async function enablePush(
  audience: PushAudience,
  options: { sessionId?: string; token?: string; userAgent?: string },
): Promise<PushResult> {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  if (Notification.permission === 'denied') return { ok: false, reason: 'blocked' };

  if (Notification.permission !== 'granted') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { ok: false, reason: 'denied' };
  }

  const key = await publicKey();
  if (!key) return { ok: false, reason: 'unavailable' };

  const reg =
    (await registration()) ?? (await navigator.serviceWorker.register('/sw.js').catch(() => null));
  if (!reg) return { ok: false, reason: 'subscribe-failed' };

  try {
    await navigator.serviceWorker.ready;
  } catch {
    // The registration exists, the worker just has not activated yet.
  }

  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    try {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      });
    } catch {
      return { ok: false, reason: 'subscribe-failed' };
    }
  }

  const payload = subscriptionPayload(subscription);
  if (!payload) return { ok: false, reason: 'subscribe-failed' };

  const response = await fetch(`${API}/subscriptions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: JSON.stringify({
      audience,
      sessionId: options.sessionId,
      userAgent: options.userAgent ?? navigator.userAgent,
      subscription: payload,
    }),
  }).catch(() => null);

  if (!response?.ok) return { ok: false, reason: 'server-failed' };

  return { ok: true };
}

export async function disablePush(
  audience: PushAudience,
  options: { sessionId?: string; token?: string },
): Promise<PushResult> {
  const subscription = await currentSubscription();
  const endpoint = subscription?.endpoint;

  if (subscription) await subscription.unsubscribe().catch(() => undefined);

  if (!endpoint) return { ok: true };

  const response = await fetch(`${API}/subscriptions`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: JSON.stringify({
      audience,
      sessionId: options.sessionId,
      endpoint,
    }),
  }).catch(() => null);

  if (!response?.ok) return { ok: false, reason: 'server-failed' };
  return { ok: true };
}

export async function sendTestPush(
  token: string,
): Promise<{ ok: boolean; sent?: number; failed?: number }> {
  const response = await fetch('/api/admin/push/test', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => null);

  if (!response?.ok) return { ok: false };

  const data = (await response.json().catch(() => null)) as {
    sent?: number;
    failed?: number;
  } | null;
  return { ok: true, sent: data?.sent ?? 0, failed: data?.failed ?? 0 };
}
