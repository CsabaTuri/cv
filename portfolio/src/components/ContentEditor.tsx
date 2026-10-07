'use client';

import {useCallback, useEffect, useState} from 'react';

type Field = {
  key: string;
  group: string;
  label: string;
  multiline: boolean;
  json: boolean;
  value: string;
  updatedAt: string | null;
};

/** Pretty-prints JSON fields so they are readable in the textarea. */
function displayValue(field: Field) {
  if (!field.json) return field.value;

  try {
    return JSON.stringify(JSON.parse(field.value), null, 2);
  } catch {
    return field.value;
  }
}

export default function ContentEditor({
  token,
  onUnauthorized,
}: {
  token: string;
  onUnauthorized: () => void;
}) {
  const [fields, setFields] = useState<Field[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  );
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/content', {
        headers: {Authorization: `Bearer ${token}`},
      });

      if (response.status === 401) {
        onUnauthorized();
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data: {fields?: Field[]} | null = await response
        .json()
        .catch(() => null);
      const incoming = data?.fields ?? [];

      setFields(incoming);
      setDraft(
        Object.fromEntries(incoming.map((field) => [field.key, displayValue(field)])),
      );
      setDirty([]);
      setError(null);
    } catch {
      setError('Nem sikerült betölteni a szövegeket.');
    }
  }, [token, onUnauthorized]);

  useEffect(() => {
    load();
  }, [load]);

  function change(key: string, value: string) {
    setDraft((prev) => ({...prev, [key]: value}));
    setDirty((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setStatus('idle');
  }

  async function save() {
    if (!dirty.length || status === 'saving') return;

    setStatus('saving');
    setError(null);

    try {
      const values = Object.fromEntries(dirty.map((key) => [key, draft[key]]));
      const response = await fetch('/api/admin/content', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
        body: JSON.stringify({values}),
      });

      if (response.status === 401) {
        onUnauthorized();
        return;
      }

      if (!response.ok) {
        const data: {error?: string} | null = await response.json().catch(() => null);
        throw new Error(data?.error ?? `HTTP ${response.status}`);
      }

      await load();
      setStatus('saved');
    } catch (saveError) {
      setStatus('error');
      setError(
        saveError instanceof Error && saveError.message.startsWith('Invalid')
          ? 'Hibás JSON az egyik mezőben.'
          : 'Nem sikerült menteni a szövegeket.',
      );
    }
  }

  const groups: {name: string; items: Field[]}[] = [];
  for (const field of fields) {
    const group = groups.find((item) => item.name === field.group);
    if (group) group.items.push(field);
    else groups.push({name: field.group, items: [field]});
  }

  return (
    <section className="mx-auto max-w-4xl px-6 pb-16">
      <div className="sticky top-0 z-10 -mx-6 mb-6 flex items-center justify-between gap-4 border-b border-gray-200 bg-gray-50/95 px-6 py-3 backdrop-blur">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">
            Weboldal szövegek
          </h2>
          <p className="text-xs text-gray-500">
            {fields.length} mező
            {dirty.length ? ` · ${dirty.length} nem mentett módosítás` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {status === 'saved' && (
            <span className="text-xs font-medium text-green-600">Mentve ✓</span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={!dirty.length || status === 'saving'}
            className="rounded-full bg-indigo-600 px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === 'saving' ? 'Mentés…' : 'Mentés'}
          </button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="space-y-6">
        {groups.map((group) => (
          <div
            key={group.name}
            className="rounded-2xl border border-gray-200 bg-white p-5"
          >
            <h3 className="text-sm font-semibold text-gray-800">{group.name}</h3>
            <div className="mt-4 space-y-4">
              {group.items.map((field) => (
                <label key={field.key} className="block">
                  <span className="text-xs font-medium text-gray-600">
                    {field.label}
                  </span>
                  {field.json && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      JSON
                    </span>
                  )}
                  {field.multiline || field.json ? (
                    <textarea
                      value={draft[field.key] ?? ''}
                      onChange={(event) => change(field.key, event.target.value)}
                      rows={field.json ? 10 : 4}
                      spellCheck={false}
                      className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 font-mono text-xs leading-relaxed outline-none focus:border-indigo-400"
                    />
                  ) : (
                    <input
                      type="text"
                      value={draft[field.key] ?? ''}
                      onChange={(event) => change(field.key, event.target.value)}
                      className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                    />
                  )}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
