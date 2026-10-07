'use client';

import {useCallback, useEffect, useState} from 'react';
import {
  currentSubscription,
  disablePush,
  enablePush,
  notificationPermission,
  pushSupported,
  sendTestPush,
  type PushAudience,
} from '@/lib/push';

export type PushState =
  | 'checking'
  | 'off'
  | 'on'
  | 'blocked'
  | 'unsupported'
  | 'insecure'
  | 'failed';

export interface PushLabels {
  enable: string;
  on: string;
  off: string;
  blocked: string;
  unsupported: string;
  insecure: string;
  failed: string;
  sent?: (sent: number, failed: number) => string;
}

interface Options {
  audience: PushAudience;
  sessionId?: string | null;
  token?: string;
  labels: PushLabels;
}

// Shared logic for the notification switch: the visitor widget and the admin
// panel each render their own button with it.
export function usePush({audience, sessionId, token, labels}: Options) {
  const [state, setState] = useState<PushState>('checking');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (typeof window === 'undefined') return;

      if (!window.isSecureContext) {
        if (!cancelled) setState('insecure');
        return;
      }
      if (!pushSupported()) {
        if (!cancelled) setState('unsupported');
        return;
      }
      if (notificationPermission() === 'denied') {
        if (!cancelled) setState('blocked');
        return;
      }

      const subscription = await currentSubscription();
      if (!cancelled) setState(subscription ? 'on' : 'off');
    })();

    return () => {
      cancelled = true;
    };
  }, [audience]);

  const toggle = useCallback(async () => {
    setMessage(null);
    setBusy(true);

    try {
      if (state === 'on') {
        const result = await disablePush(audience, {sessionId: sessionId ?? undefined, token});
        if (result.ok) setState('off');
        else setMessage(labels.failed);
        return;
      }

      const result = await enablePush(audience, {
        sessionId: sessionId ?? undefined,
        token,
      });

      if (result.ok) {
        setState('on');
        return;
      }

      if (result.reason === 'denied') setState('blocked');
      else if (result.reason === 'unsupported') setState('unsupported');
      else if (result.reason === 'unavailable') setState('failed');

      setMessage(
        result.reason === 'denied' || result.reason === 'blocked'
          ? labels.blocked
          : result.reason === 'unsupported'
            ? labels.unsupported
            : labels.failed,
      );
    } finally {
      setBusy(false);
    }
  }, [audience, labels, sessionId, state, token]);

  const test = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    setMessage(null);

    try {
      const result = await sendTestPush(token);
      if (!result.ok) {
        setMessage(labels.failed);
        return;
      }
      setMessage(labels.sent ? labels.sent(result.sent ?? 0, result.failed ?? 0) : null);
    } finally {
      setBusy(false);
    }
  }, [labels, token]);

  const label =
    state === 'on'
      ? labels.off
      : state === 'blocked'
        ? labels.blocked
        : state === 'unsupported'
          ? labels.unsupported
          : state === 'insecure'
            ? labels.insecure
            : labels.enable;

  return {
    state,
    busy,
    message,
    label,
    // A blocked or unsupported browser cannot be asked again.
    disabled: busy || state === 'checking' || state === 'blocked' || state === 'unsupported' || state === 'insecure',
    toggle,
    test,
    canTest: Boolean(token) && state === 'on',
  };
}
