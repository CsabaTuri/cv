'use client';

import {useEffect, useState} from 'react';
import ChatInbox from './ChatInbox';
import ContentEditor from './ContentEditor';

const TOKEN_KEY = 'cv-chat-admin-token';

export default function AdminChat() {
  const [token, setToken] = useState('');
  const [ready, setReady] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [tab, setTab] = useState<'inbox' | 'content'>('inbox');
  const [error, setError] = useState<string | null>(null);

  // The stored token is only available in the browser, so the login form is
  // rendered after the first client-side effect.
  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY) ?? '');
    setReady(true);
  }, []);

  function unlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = tokenInput.trim();
    if (!value) return;

    window.localStorage.setItem(TOKEN_KEY, value);
    setTokenInput('');
    setError(null);
    setToken(value);
  }

  function signOut() {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setError(null);
  }

  function handleUnauthorized() {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setError('Érvénytelen admin token.');
  }

  if (!ready) {
    return <main className="min-h-screen bg-gray-50" />;
  }

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
        <form
          onSubmit={unlock}
          className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <h1 className="text-lg font-semibold">Admin</h1>
          <p className="mt-1 text-sm text-gray-500">
            Írd be az admin tokent (ADMIN_TOKEN a .env fájlban).
          </p>
          <input
            type="password"
            value={tokenInput}
            onChange={(event) => setTokenInput(event.target.value)}
            placeholder="Admin token"
            aria-label="Admin token"
            autoFocus
            className="mt-4 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
          />
          <button
            type="submit"
            className="mt-3 w-full rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
          >
            Belépés
          </button>
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-600">
              {error}
            </p>
          )}
        </form>
      </main>
    );
  }

  const tabClass = (name: 'inbox' | 'content') =>
    `rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
      tab === name
        ? 'bg-indigo-600 text-white'
        : 'border border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-900'
    }`;

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">Admin</h1>
            <p className="text-xs text-gray-500">Önéletrajz kezelése</p>
          </div>

          <nav className="flex items-center gap-2">
            <button type="button" onClick={() => setTab('inbox')} className={tabClass('inbox')}>
              Üzenetek
            </button>
            <button
              type="button"
              onClick={() => setTab('content')}
              className={tabClass('content')}
            >
              Szövegek
            </button>
          </nav>

          <button
            type="button"
            onClick={signOut}
            className="rounded-full border border-gray-300 px-4 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-900"
          >
            Kilépés
          </button>
        </div>
      </header>

      {error && (
        <p className="mx-auto max-w-7xl px-6 pt-4 text-sm text-red-600">{error}</p>
      )}

      {tab === 'inbox' ? (
        <ChatInbox token={token} onUnauthorized={handleUnauthorized} />
      ) : (
        <ContentEditor token={token} onUnauthorized={handleUnauthorized} />
      )}
    </main>
  );
}
