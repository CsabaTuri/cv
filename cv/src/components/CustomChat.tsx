'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {useText} from './ContentProvider';
import {MessageCircle, Send, X} from './icons';

// Same-origin: nginx proxies /api/ to the chat-backend service (see nginx.conf).
const API_BASE = '/api/chat';
const SESSION_KEY = 'portfolio-chat-session';
const POLL_INTERVAL_MS = 3000;
const MAX_MESSAGE_LENGTH = 4000;

type ChatMessage = {
  id: number;
  role: 'visitor' | 'admin';
  body: string;
  createdAt: string;
};

export default function CustomChat() {
  const title = useText('chat.title');
  const subtitle = useText('chat.subtitle');
  const greeting = useText('chat.greeting');
  const placeholder = useText('chat.placeholder');
  const sendLabel = useText('chat.send');
  const waitingLabel = useText('chat.waiting');
  const errorLabel = useText('chat.error');
  const openLabel = useText('chat.openLabel');
  const closeLabel = useText('chat.closeLabel');

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  // The session id ties the visitor to their stored conversation.
  const session = useRef<string | null>(null);
  const cursor = useRef(0);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    session.current = window.localStorage.getItem(SESSION_KEY);
  }, []);

  // Pulls everything that arrived since the last poll (own messages included,
  // they are deduplicated by the cursor).
  const refresh = useCallback(async () => {
    const sessionId = session.current;
    if (!sessionId) return;

    try {
      const response = await fetch(
        `${API_BASE}/messages?sessionId=${encodeURIComponent(sessionId)}&afterId=${cursor.current}`,
      );
      if (!response.ok) return;

      const data: {messages?: ChatMessage[]; cursor?: number} | null = await response
        .json()
        .catch(() => null);
      const incoming = Array.isArray(data?.messages) ? data.messages : [];
      if (!incoming.length) return;

      setMessages((prev) => [...prev, ...incoming]);
      cursor.current = data?.cursor ?? incoming[incoming.length - 1].id;
    } catch {
      // Transient network problem: the next poll retries.
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [open, refresh]);

  useEffect(() => {
    log.current?.scrollTo({top: log.current.scrollHeight});
  }, [messages, sending, open]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = input.trim();
    if (!text || sending) return;

    setInput('');
    setFailed(false);
    setSending(true);

    try {
      const response = await fetch(API_BASE, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({sessionId: session.current, message: text}),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data: {sessionId?: string; message?: ChatMessage} | null = await response
        .json()
        .catch(() => null);

      if (typeof data?.sessionId === 'string') {
        session.current = data.sessionId;
        window.localStorage.setItem(SESSION_KEY, data.sessionId);
      }

      if (data?.message) {
        setMessages((prev) => [...prev, data.message as ChatMessage]);
        cursor.current = Math.max(cursor.current, data.message.id);
      }
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  }

  const waiting =
    messages.length > 0 && messages[messages.length - 1].role === 'visitor';

  return (
    <>
      {/* Sits left of where third-party chat launchers usually go (bottom right). */}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? closeLabel : openLabel}
        className="fixed bottom-5 right-5 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition-colors hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={title}
          className="fixed bottom-20 right-4 z-40 flex h-[26rem] max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
        >
          <header className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
            <div>
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-xs text-gray-500">
                {subtitle}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={closeLabel}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div ref={log} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <div className="flex justify-start">
                <p className="max-w-[85%] rounded-2xl rounded-bl-sm bg-gray-100 px-3.5 py-2 text-sm text-gray-800">
                  {greeting}
                </p>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.role === 'visitor'
                    ? 'flex justify-end'
                    : 'flex justify-start'
                }
              >
                <p
                  className={
                    message.role === 'visitor'
                      ? 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-indigo-600 px-3.5 py-2 text-sm text-white'
                      : 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-gray-100 px-3.5 py-2 text-sm text-gray-800'
                  }
                >
                  {message.body}
                </p>
              </div>
            ))}

            {(sending || waiting) && (
              <p className="text-xs text-gray-500">{waitingLabel}</p>
            )}

            {failed && (
              <p role="alert" className="text-xs text-red-600">
                {errorLabel}
              </p>
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 border-t border-gray-200 p-3"
          >
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={placeholder}
              aria-label={placeholder}
              maxLength={MAX_MESSAGE_LENGTH}
              className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-400"
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              aria-label={sendLabel}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition-colors hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
