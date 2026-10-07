'use strict';

// ---------------------------------------------------------------------------
// deployer - the only service allowed to talk to /var/run/docker.sock.
//
// It exposes one destructive action (rebuild + restart the stack) to the admin
// panel. Security properties, on purpose:
//
//   * the command is hardcoded: no shell, and the only variable part is the
//     service list from the environment, validated against a strict pattern
//   * a single build runs at a time; a second request gets 409
//   * every endpoint but /health requires ADMIN_TOKEN (Bearer, compared in
//     constant time) and the helper fails closed when the token is empty
//   * nothing is served unless DEPLOY_ENABLED=true
//   * the service publishes no port; it is only reachable through nginx on the
//     internal network
// ---------------------------------------------------------------------------

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {timingSafeEqual} = require('node:crypto');

const PORT = Number(process.env.PORT || 4000);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const ENABLED = String(process.env.DEPLOY_ENABLED || 'false').toLowerCase() === 'true';
const PROJECT_DIR = process.env.PROJECT_DIR || '/workspace';
const STATE_FILE = path.join(process.env.STATE_DIR || '/state', 'last-build.json');
const BUILD_TIMEOUT_MS = Number(process.env.DEPLOY_TIMEOUT_MS || 900000);
const MAX_LOG_LINES = 500;
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const SERVICE_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

// Compose reads the project `.env` for interpolation. The helper has no
// business reading the secrets file - and cannot, it is 0600 and owned by the
// host user, not by this container - so the triggered run is pointed at an
// empty env file instead: every value it needs is passed explicitly through
// this container's environment (see the `deployer` service in the compose
// file).
const ENV_FILE = process.env.COMPOSE_ENV_FILES || '/tmp/deploy-env/empty.env';

// Services are appended to the command line, so they are validated rather than
// trusted: `docker compose up -d --build <service> ...`.
const SERVICES = String(process.env.DEPLOY_SERVICES || 'cv chat-backend')
  .trim()
  .split(/\s+/)
  .filter((name) => SERVICE_PATTERN.test(name));

let run = {
  state: 'idle',
  startedAt: null,
  finishedAt: null,
  exitCode: null,
  services: SERVICES,
  lines: [],
};

let child = null;
let shutdownRequested = false;

function log(line) {
  run.lines.push(line);
  if (run.lines.length > MAX_LOG_LINES) {
    run.lines.splice(0, run.lines.length - MAX_LOG_LINES);
  }
}

function persist() {
  try {
    const tmp = `${STATE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(run));
    fs.renameSync(tmp, STATE_FILE);
  } catch (error) {
    console.error(`deployer: cannot persist state: ${error.message}`);
  }
}

function restore() {
  try {
    const stored = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (stored && typeof stored === 'object') {
      run = {...run, ...stored, services: SERVICES};
      // A build cannot survive the process that started it, so a stored
      // `running` state means the helper was restarted mid-build.
      if (run.state === 'running') {
        run.state = 'failed';
        run.exitCode = null;
        log('A buildet megszakította a deployer újraindulása.');
      }
    }
  } catch {
    // No previous state yet - start from a clean slate.
  }
}

function authorized(req) {
  if (!ADMIN_TOKEN) return false;

  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return false;

  const given = Buffer.from(header.slice(7), 'utf8');
  const expected = Buffer.from(ADMIN_TOKEN, 'utf8');
  if (given.length !== expected.length) return false;

  return timingSafeEqual(given, expected);
}

function send(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function elapsedSeconds() {
  if (!run.startedAt) return 0;
  const end = run.finishedAt ? Date.parse(run.finishedAt) : Date.now();
  return Math.round((end - Date.parse(run.startedAt)) / 1000);
}

// The only command this service can ever run.
function startBuild() {
  const args = ['compose', 'up', '-d', '--build', ...SERVICES];

  run = {
    state: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    services: SERVICES,
    lines: [],
  };
  log(`$ docker ${args.join(' ')}`);
  log(`  (${PROJECT_DIR}, COMPOSE_FILE=${process.env.COMPOSE_FILE || 'docker-compose.yml'})`);
  log(`  (${ENV_FILE} - a repo .env-jét nem olvassa, minden érték innen jön)`);
  persist();

  child = spawn('docker', args, {
    cwd: PROJECT_DIR,
    env: {
      ...process.env,
      HOME: process.env.HOME || '/tmp',
      DOCKER_CONFIG: process.env.DOCKER_CONFIG || '/tmp/docker-config',
      // Plain, uncoloured output: it ends up in a <pre> in the browser.
      COMPOSE_PROGRESS: 'plain',
      COMPOSE_ANSI: 'never',
      COMPOSE_PROFILES: process.env.COMPOSE_PROFILES || 'deploy',
      COMPOSE_ENV_FILES: ENV_FILE,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const collect = (chunk) => {
    for (const line of String(chunk).replace(ANSI, '').split('\n')) {
      const trimmed = line.replace(/\s+$/, '');
      if (trimmed) log(trimmed);
    }
    persist();
  };

  child.stdout.on('data', collect);
  child.stderr.on('data', collect);

  const timeout = setTimeout(() => {
    log(`Időtúllépés (${Math.round(BUILD_TIMEOUT_MS / 1000)} s) - a build leállítása.`);
    child.kill('SIGTERM');
    setTimeout(() => child && child.kill('SIGKILL'), 10000).unref();
  }, BUILD_TIMEOUT_MS);
  timeout.unref();

  child.on('error', (error) => {
    clearTimeout(timeout);
    log(`Hiba: ${error.message}`);
    if (error.code === 'EACCES') {
      log('Nem érhető el a Docker socket. Ellenőrizd a /var/run/docker.sock kötést.');
    }
    run.state = 'failed';
    run.exitCode = null;
    run.finishedAt = new Date().toISOString();
    child = null;
    persist();
  });

  child.on('close', (code, signal) => {
    clearTimeout(timeout);
    child = null;
    run.exitCode = typeof code === 'number' ? code : null;
    run.state = code === 0 ? 'success' : 'failed';
    run.finishedAt = new Date().toISOString();
    log(
      code === 0
        ? `Kész (${elapsedSeconds()} s).`
        : `Sikertelen: kilépési kód ${code === null ? `nincs (${signal})` : code}.`
    );
    persist();

    if (shutdownRequested) {
      process.exit(0);
    }
  });
}

function currentStatus() {
  const start = run.startedAt ? Date.parse(run.startedAt) : null;
  const end = run.finishedAt ? Date.parse(run.finishedAt) : Date.now();

  return {
    enabled: ENABLED,
    state: run.state,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    exitCode: run.exitCode,
    services: run.services,
    durationMs: start === null ? null : end - start,
    composeFiles: String(process.env.COMPOSE_FILE || '').split(':').filter(Boolean),
    lines: run.lines,
  };
}

const server = http.createServer((req, res) => {
  const {pathname} = new URL(req.url, 'http://localhost');

  // Unauthenticated on purpose: used by the container healthcheck.
  if (pathname === '/api/deploy/health') {
    return send(res, 200, {ok: true, enabled: ENABLED, state: run.state});
  }

  if (pathname === '/api/deploy/status' && (req.method === 'GET' || req.method === 'HEAD')) {
    if (!authorized(req)) return send(res, 401, {error: 'unauthorized'});
    return send(res, 200, currentStatus());
  }

  if (pathname === '/api/deploy/run' && req.method === 'POST') {
    if (!authorized(req)) return send(res, 401, {error: 'unauthorized'});
    if (!ENABLED) {
      return send(res, 503, {error: 'disabled'});
    }
    if (!SERVICES.length) {
      return send(res, 500, {error: 'no_services'});
    }
    if (run.state === 'running') {
      return send(res, 409, {error: 'busy', startedAt: run.startedAt});
    }

    startBuild();
    return send(res, 202, {started: true, startedAt: run.startedAt, services: SERVICES});
  }

  return send(res, 404, {error: 'not_found'});
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 70000;
server.on('clientError', (_error, socket) => socket.destroy());

function shutdown(signal) {
  console.log(`deployer: ${signal}, shutting down`);
  server.close();

  if (child) {
    // Let a build in progress finish (bounded by stop_grace_period) instead of
    // killing it halfway through a restart of the stack.
    shutdownRequested = true;
    console.log('deployer: waiting for the running build to finish');
    return;
  }

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

function prepareEnvFile() {
  try {
    fs.mkdirSync(path.dirname(ENV_FILE), {recursive: true});
    fs.writeFileSync(ENV_FILE, '');
  } catch (error) {
    console.error(`deployer: cannot prepare ${ENV_FILE}: ${error.message}`);
  }
}

prepareEnvFile();
restore();
server.listen(PORT, () => {
  console.log(
    `deployer: listening on ${PORT}, enabled=${ENABLED}, services=[${SERVICES.join(' ')}]`
  );
});
