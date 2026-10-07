'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/** Shown until a value for the key exists in the database. */
const PLACEHOLDER = '…';

const ContentContext = createContext<Record<string, string>>({});

/**
 * Every text of the site comes from the database (GET /api/content, editable on
 * the admin page). Nothing is baked into the components: while the fetch is in
 * flight — or when a key has not been provided yet — the placeholder shows.
 */
export function ContentProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch('/api/content');
        if (!response.ok) return;

        const data: { content?: Record<string, string> } | null = await response
          .json()
          .catch(() => null);
        if (!cancelled && data?.content) setContent(data.content);
      } catch {
        // Keep the placeholders.
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the tab title and the meta description in sync with the stored copy.
  useEffect(() => {
    const title = content['metadata.title'];
    const description = content['metadata.description'];

    if (title) document.title = title;
    if (description) {
      document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    }
  }, [content]);

  return <ContentContext.Provider value={content}>{children}</ContentContext.Provider>;
}

/** The stored text for a key, or the placeholder. */
export function useText(key: string) {
  const content = useContext(ContentContext);
  // An empty stored value counts as "not provided yet".
  return content[key] || PLACEHOLDER;
}

/** A JSON field (list, card set) parsed into typed values. */
export function useJsonList<T>(key: string): T[] {
  const content = useContext(ContentContext);
  const raw = content[key];
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/** Renders the `**bold**` segments of a stored text. */
export function renderBold(text: string) {
  return text.split('**').map((part, index) =>
    index % 2 === 1 ? (
      <strong key={index} className="font-semibold text-gray-900">
        {part}
      </strong>
    ) : (
      part
    ),
  );
}
