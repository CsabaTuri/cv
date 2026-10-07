'use client';

import {useCallback, useEffect, useRef, useState} from 'react';

type BuildState = 'idle' | 'running' | 'success' | 'failed';

interface BuildStatus {
  enabled: boolean;
  state: BuildState;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  services: string[];
  durationMs: number | null;
  composeFiles: string[];
  lines: string[];
}

type Availability = 'checking' | 'ok' | 'disabled' | 'unreachable';

const ENABLE_COMMAND =
  'docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile deploy up -d';

function formatDuration(ms: number | null) {
  if (ms === null) return '';
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;

  const minutes = Math.floor(seconds / 60);
  return `${minutes} perc ${String(seconds % 60).padStart(2, '0')} s`;
}

export default function DeployPanel({
  token,
  onUnauthorized,
}: {
  token: string;
  onUnauthorized: () => void;
}) {
  const [status, setStatus] = useState<BuildStatus | null>(null);
  const [availability, setAvailability] = useState<Availability>('checking');
  const [armed, setArmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [stale, setStale] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  // The rebuild restarts the container that serves this page, so a poll can
  // fail on its own: only a run of failures means the helper is really gone,
  // and never while a build we are watching is still running.
  const failures = useRef(0);
  const watching = useRef(false);

  const load = useCallback(async () => {
    const unreachable = () => {
      failures.current += 1;
      if (failures.current < 3) return;

      if (watching.current) setStale(true);
      else setAvailability('unreachable');
    };

    try {
      const response = await fetch('/api/deploy/status', {
        headers: {Authorization: `Bearer ${token}`},
        cache: 'no-store',
      });

      if (response.status === 401) {
        onUnauthorized();
        return;
      }
      // 502 without a running `deploy` profile: the helper is not there.
      if (!response.ok) {
        unreachable();
        return;
      }

      const data = (await response.json()) as BuildStatus;
      failures.current = 0;
      setStale(false);
      setStatus(data);
      setAvailability(data.enabled ? 'ok' : 'disabled');
    } catch {
      unreachable();
    }
  }, [token, onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  const running = status?.state === 'running';

  useEffect(() => {
    watching.current = running;
  }, [running]);

  // Poll while a build runs, and keep retrying (slowly) while the helper is
  // unreachable or still being checked, so the panel recovers by itself once
  // it is started. Nothing is polled while the state is settled.
  useEffect(() => {
    if (!running && availability === 'ok') return;

    const poll = window.setInterval(() => void load(), running ? 1500 : 3000);
    return () => window.clearInterval(poll);
  }, [running, availability, load]);

  // Only the elapsed time needs a second-by-second ticker.
  useEffect(() => {
    if (!running) return;

    const ticker = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(ticker);
  }, [running]);

  // Follow the build output.
  useEffect(() => {
    const element = logRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [status?.lines]);

  async function start() {
    setArmed(false);
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch('/api/deploy/run', {
        method: 'POST',
        headers: {Authorization: `Bearer ${token}`},
      });

      if (response.status === 401) {
        onUnauthorized();
        return;
      }
      if (response.status === 503) {
        setAvailability('disabled');
        return;
      }
      if (response.status === 409) {
        setMessage('Már fut egy build, megvárjuk.');
      } else if (response.status !== 202) {
        setMessage('Nem sikerült elindítani a buildet.');
      }

      await load();
    } catch {
      setMessage('Nem sikerült elérni a build szolgáltatást.');
    } finally {
      setBusy(false);
    }
  }

  const elapsed =
    running && status?.startedAt ? now - Date.parse(status.startedAt) : status?.durationMs ?? null;

  return (
    <div className="mx-auto max-w-4xl px-6 py-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold">Újrabuildelés</h2>
        <p className="mt-1 text-sm text-gray-600">
          Újraépíti a(z){' '}
          <code className="rounded bg-gray-100 px-1">
            {status?.services.join(', ') || 'cv, chat-backend'}
          </code>{' '}
          image-eket a szerveren, majd újraindítja őket. A folyamat a konténerben fut, az
          oldal közben néhány másodpercre elérhetetlen lehet.
        </p>
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          A szövegek szerkesztése az <strong>Szövegek</strong> fülön nem igényel buildet — azok
          azonnal az adatbázisból jönnek. Erre a gombra csak akkor van szükség, ha a kód
          változott.
        </p>

        {availability === 'checking' && (
          <p className="mt-4 text-sm text-gray-500">Állapot ellenőrzése…</p>
        )}

        {availability === 'unreachable' && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">A build szolgáltatás nem fut.</p>
            <p className="mt-1 text-xs">
              Indítsd el egyszer a <code>deploy</code> profile-lal, utána megjelenik ez a gomb:
            </p>
            <div className="mt-2 flex items-start gap-2">
              <code className="flex-1 overflow-x-auto rounded-lg bg-white px-3 py-2 text-xs">
                {ENABLE_COMMAND}
              </code>
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(ENABLE_COMMAND)}
                className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold hover:bg-amber-100"
              >
                Másolás
              </button>
            </div>
          </div>
        )}

        {availability === 'disabled' && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">A build szolgáltatás ki van kapcsolva.</p>
            <p className="mt-1 text-xs">
              Állítsd a <code>DEPLOY_ENABLED=true</code> értéket a <code>.env</code> fájlba, és
              indítsd újra a helper konténert.
            </p>
          </div>
        )}

        {availability === 'ok' && status && (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  status.state === 'running'
                    ? 'bg-indigo-100 text-indigo-700'
                    : status.state === 'success'
                      ? 'bg-emerald-100 text-emerald-700'
                      : status.state === 'failed'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-600'
                }`}
              >
                {status.state === 'running'
                  ? 'Build fut…'
                  : status.state === 'success'
                    ? 'Sikeres build'
                    : status.state === 'failed'
                      ? 'Sikertelen build'
                      : 'Még nem futott build'}
              </span>

              {status.state !== 'idle' && elapsed !== null && (
                <span className="text-gray-500">{formatDuration(elapsed)}</span>
              )}

              {status.state !== 'idle' && status.state !== 'running' && status.exitCode !== null && (
                <span className="text-gray-500">kilépési kód: {status.exitCode}</span>
              )}

              {status.finishedAt && (
                <span className="text-gray-500">
                  {new Date(status.finishedAt).toLocaleString('hu-HU')}
                </span>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {armed ? (
                <>
                  <span className="text-sm text-red-700">
                    Biztosan indítom? Az oldal rövid időre elérhetetlen lesz.
                  </span>
                  <button
                    type="button"
                    onClick={() => void start()}
                    disabled={busy || running}
                    className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
                  >
                    Igen, indítom
                  </button>
                  <button
                    type="button"
                    onClick={() => setArmed(false)}
                    className="rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 hover:border-gray-400"
                  >
                    Mégsem
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setArmed(true)}
                    disabled={running || busy}
                    className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {running ? 'Build folyamatban…' : 'Újrabuildelés indítása'}
                  </button>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 hover:border-gray-400"
                  >
                    Frissítés
                  </button>
                </>
              )}
            </div>

            {message && <p className="mt-3 text-sm text-red-600">{message}</p>}

            {stale && (
              <p className="mt-3 rounded-xl bg-gray-100 px-3 py-2 text-xs text-gray-600">
                Az oldalt kiszolgáló konténer épp újraindul, a napló késve frissül.
              </p>
            )}

            {status.lines.length > 0 && (
              <pre
                ref={logRef}
                className="mt-4 max-h-96 overflow-auto rounded-xl bg-gray-900 p-4 text-xs leading-relaxed text-gray-100"
              >
                {status.lines.join('\n')}
              </pre>
            )}
          </>
        )}
      </section>
    </div>
  );
}
