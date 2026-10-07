'use client';

import {useEffect, useRef, useState} from 'react';
import {useTranslations} from 'next-intl';
import {MessageCircle, Send, X} from './icons';

/**
 * Where to POST the messages. The default is same-origin: nginx proxies
 * `/api/chat` to the chat-backend service (see nginx.conf), so the n8n webhook
 * credential never reaches the browser. For `next dev` point it at the local
 * backend in `.env.local`, e.g. NEXT_PUBLIC_CHAT_API_URL=http://localhost:3112/api/chat
 */
const CHAT_API_URL = process.env.NEXT_PUBLIC_CHAT_API_URL ?? '/api/chat';

const MAX_MESSAGE_LENGTH = 2000;

type ChatMessage = {
  role: 'user' | 'assistant';
  text: string;
};

export default function CustomChat() {
  const t = useTranslations('chat');
  const tA11y = useTranslations('a11y');

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {role: 'assistant', text: t('greeting')},
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const sessionId = useRef<string | null>(null);
  const log = useRef<HTMLDivElement>(null);

  // One id per visit, so the n8n workflow can keep the conversation together.
  useEffect(() => {
    sessionId.current ??= crypto.randomUUID();
  }, []);

  useEffect(() => {
    log.current?.scrollTo({top: log.current.scrollHeight});
  }, [messages, sending, open]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = input.trim();
    if (!text || sending) return;

    setMessages((prev) => [...prev, {role: 'user', text}]);
    setInput('');
    setFailed(false);
    setSending(true);

    try {
      sessionId.current ??= crypto.randomUUID();

      const response = await fetch(CHAT_API_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({sessionId: sessionId.current, message: text}),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data: {reply?: string | null} | null = await response
        .json()
        .catch(() => null);
      const reply = typeof data?.reply === 'string' ? data.reply.trim() : '';

      setMessages((prev) => [
        ...prev,
        {role: 'assistant', text: reply || t('sent')},
      ]);
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Sits left of the Crisp launcher, which is anchored to the bottom right. */}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? tA11y('chatClose') : tA11y('chatToggle')}
        className="fixed bottom-5 right-24 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition-colors hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-400"
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('title')}
          className="fixed bottom-20 right-4 z-40 flex h-[26rem] max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl sm:right-24 dark:border-gray-800 dark:bg-gray-900"
        >
          <header className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
            <div>
              <p className="text-sm font-semibold">{t('title')}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('subtitle')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={tA11y('chatClose')}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div ref={log} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={
                  message.role === 'user' ? 'flex justify-end' : 'flex justify-start'
                }
              >
                <p
                  className={
                    message.role === 'user'
                      ? 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-indigo-600 px-3.5 py-2 text-sm text-white'
                      : 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-gray-100 px-3.5 py-2 text-sm text-gray-800 dark:bg-gray-800 dark:text-gray-100'
                  }
                >
                  {message.text}
                </p>
              </div>
            ))}

            {sending && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('thinking')}
              </p>
            )}

            {failed && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                {t('error')}
              </p>
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 border-t border-gray-200 p-3 dark:border-gray-800"
          >
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t('placeholder')}
              aria-label={t('placeholder')}
              maxLength={MAX_MESSAGE_LENGTH}
              className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-400 dark:border-gray-700 dark:bg-gray-950 dark:placeholder:text-gray-500 dark:focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              aria-label={t('send')}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition-colors hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
