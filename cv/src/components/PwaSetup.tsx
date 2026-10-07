'use client';

import {useEffect, useState} from 'react';
import {useText} from './ContentProvider';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{outcome: 'accepted' | 'dismissed'}>;
}

// Registers the service worker (offline shell + push notifications) and shows
// the install button when the browser offers one. Mounted once in the root
// layout, so the visitor page gets the offer and the admin panel only the
// worker.
export default function PwaSetup() {
  const installLabel = useText('pwa.install');
  const dismissLabel = useText('pwa.dismiss');
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [admin, setAdmin] = useState(true);

  useEffect(() => {
    setAdmin(window.location.pathname.startsWith('/admin'));

    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice.catch(() => null);
    if (choice?.outcome === 'accepted') setPrompt(null);
  }

  if (admin || !prompt || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 z-40 flex max-w-[min(20rem,calc(100vw-2rem))] items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-xl">
      <img src="/icons/icon-192.png" alt="" width={32} height={32} className="h-8 w-8 rounded-lg" />
      <button
        type="button"
        onClick={() => void install()}
        className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-500"
      >
        {installLabel}
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label={dismissLabel}
        className="rounded-lg px-2 py-1 text-sm text-gray-400 transition-colors hover:text-gray-700"
      >
        ×
      </button>
    </div>
  );
}
