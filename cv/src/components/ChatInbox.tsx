'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {Send} from './icons';

const POLL_INTERVAL_MS = 3000;
const MAX_MESSAGE_LENGTH = 4000;

type Message = {
  id: number;
  role: 'visitor' | 'admin';
  body: string;
  createdAt: string;
};

type Conversation = {
  id: string;
  number: number;
  createdAt: string;
  lastMessageAt: string;
  visitorIp: string | null;
  messageCount: number;
  unread: number;
  lastMessage: Message | null;
};

function formatTimestamp(iso: string) {
  const date = new Date(iso);
  const time = date.toLocaleTimeString('hu-HU', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (date.toDateString() === new Date().toDateString()) return time;

  return `${date.toLocaleDateString('hu-HU')} ${time}`;
}

export default function ChatInbox({
  token,
  onUnauthorized,
}: {
  token: string;
  onUnauthorized: () => void;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeRef = useRef<string | null>(null);
  const thread = useRef<HTMLDivElement>(null);

  const authHeaders = useCallback(
    (value: string) => ({Authorization: `Bearer ${value}`}),
    [],
  );

  const loadConversations = useCallback(
    async (value: string) => {
      const response = await fetch('/api/admin/conversations', {
        headers: authHeaders(value),
      });

      if (response.status === 401) {
        onUnauthorized();
        return;
      }
      if (!response.ok) {
        setError('Nem sikerült betölteni a beszélgetéseket.');
        return;
      }

      const data: {conversations?: Conversation[]} | null = await response
        .json()
        .catch(() => null);
      setConversations(data?.conversations ?? []);
      setError(null);
    },
    [authHeaders, onUnauthorized],
  );

  const loadMessages = useCallback(
    async (value: string, id: string) => {
      const response = await fetch(
        `/api/admin/conversations/${encodeURIComponent(id)}/messages?afterId=0`,
        {headers: {Authorization: `Bearer ${value}`}},
      );
      if (response.status === 401) {
        onUnauthorized();
        return;
      }
      if (!response.ok) return;

      const data: {messages?: Message[]} | null = await response
        .json()
        .catch(() => null);
      setMessages(data?.messages ?? []);
    },
    [onUnauthorized],
  );

  // Poll the inbox (and the open thread) while the page is open.
  useEffect(() => {
    let cancelled = false;

    async function tick() {
      if (cancelled) return;
      await loadConversations(token);
      const id = activeRef.current;
      if (id) await loadMessages(token, id);
    }

    tick();
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token, loadConversations, loadMessages]);

  useEffect(() => {
    thread.current?.scrollTo({top: thread.current.scrollHeight});
  }, [messages]);

  function openConversation(id: string) {
    activeRef.current = id;
    setActiveId(id);
    setMessages([]);
    loadMessages(token, id);
  }

  async function sendReply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = reply.trim();
    if (!text || !activeRef.current || sending) return;

    setSending(true);
    try {
      const response = await fetch(
        `/api/admin/conversations/${encodeURIComponent(activeRef.current)}/reply`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json', ...authHeaders(token)},
          body: JSON.stringify({message: text}),
        },
      );

      if (response.status === 401) {
        onUnauthorized();
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      setReply('');
      await loadMessages(token, activeRef.current);
      await loadConversations(token);
    } catch {
      setError('Nem sikerült elküldeni a választ.');
    } finally {
      setSending(false);
    }
  }

  const active = conversations.find((item) => item.id === activeId) ?? null;

  return (
    <>
      {error && <p className="mx-auto max-w-7xl px-6 pt-4 text-sm text-red-600">{error}</p>}

      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[20rem_1fr]">
        <aside className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {conversations.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">Még nincs üzenet.</p>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-gray-100 overflow-y-auto">
              {conversations.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openConversation(item.id)}
                    className={`w-full px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                      item.id === activeId ? 'bg-indigo-50' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-gray-700">
                        #{item.number} · {item.visitorIp ?? 'ismeretlen IP'}
                      </span>
                      <span className="shrink-0 text-[11px] text-gray-400">
                        {formatTimestamp(item.lastMessageAt)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-gray-500">
                      {item.lastMessage?.role === 'admin' ? 'Te: ' : ''}
                      {item.lastMessage?.body}
                    </p>
                    {item.unread > 0 && (
                      <span className="mt-2 inline-flex rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                        {item.unread} új
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="flex min-h-[70vh] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {!active ? (
            <p className="m-auto px-6 py-16 text-sm text-gray-500">
              Válassz egy látogatót.
            </p>
          ) : (
            <>
              <header className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">
                    #{active.number} · {active.visitorIp ?? 'ismeretlen IP'}
                  </p>
                  <p className="text-xs text-gray-500">
                    Indult: {formatTimestamp(active.createdAt)} ·{' '}
                    {active.messageCount} üzenet
                  </p>
                </div>
                <span className="text-[11px] text-gray-400">
                  {active.id.slice(0, 8)}
                </span>
              </header>

              <div ref={thread} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={
                      message.role === 'admin'
                        ? 'flex justify-end'
                        : 'flex justify-start'
                    }
                  >
                    <div
                      className={
                        message.role === 'admin'
                          ? 'max-w-[75%] rounded-2xl rounded-br-sm bg-indigo-600 px-3.5 py-2 text-sm text-white'
                          : 'max-w-[75%] rounded-bl-sm rounded-2xl bg-gray-100 px-3.5 py-2 text-sm text-gray-800'
                      }
                    >
                      <p className="whitespace-pre-wrap">{message.body}</p>
                      <p
                        className={`mt-1 text-[10px] ${
                          message.role === 'admin'
                            ? 'text-indigo-100'
                            : 'text-gray-400'
                        }`}
                      >
                        {formatTimestamp(message.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <form
                onSubmit={sendReply}
                className="flex items-center gap-2 border-t border-gray-200 p-3"
              >
                <input
                  type="text"
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder="Írd meg a választ…"
                  aria-label="Válasz"
                  maxLength={MAX_MESSAGE_LENGTH}
                  className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-400"
                />
                <button
                  type="submit"
                  disabled={!reply.trim() || sending}
                  aria-label="Válasz küldése"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </>
  );
}
