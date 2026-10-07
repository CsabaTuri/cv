// cv-update.sh is the way a host moves to a new commit, so it gets the same
// treatment as the rest: a sandbox with a real bare repository, a stale working
// tree and stubbed docker/curl binaries, because the script must never touch the
// machine it is tested on.

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../cv-update.sh', import.meta.url));
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};

const dirs = [];

function git(cwd, ...args) {
  const run = spawnSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8' });
  assert.equal(run.status, 0, `git ${args.join(' ')}: ${run.stderr}`);
  return run.stdout.trim();
}

/**
 * A host that is one commit behind its origin: `origin` has a commit the
 * checkout does not, which is exactly the state that used to leave the frontend
 * behind while the backend moved on.
 */
function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'cv-update-'));
  dirs.push(root);

  const bin = join(root, 'bin');
  mkdirSync(bin);
  // Stubs: the deploy must not be able to reach a real docker socket.
  writeFileSync(
    join(bin, 'docker'),
    `#!/usr/bin/env bash\necho "docker $*" >> "\${STUB_LOG}"\nexit 0\n`,
  );
  writeFileSync(
    join(bin, 'curl'),
    `#!/usr/bin/env bash\necho "curl $*" >> "\${STUB_LOG}"\necho 200\n`,
  );
  chmodSync(join(bin, 'docker'), 0o755);
  chmodSync(join(bin, 'curl'), 0o755);

  const origin = join(root, 'origin.git');
  const repo = join(root, 'repo');
  const other = join(root, 'other');
  const log = join(root, 'stub.log');
  writeFileSync(log, '');

  spawnSync('git', ['init', '--bare', '--initial-branch=main', origin], { env: GIT_ENV });

  mkdirSync(repo);
  git(repo, 'init', '--initial-branch=main');
  writeFileSync(join(repo, 'docker-compose.yml'), 'services:\n  cv:\n    image: first\n');
  writeFileSync(join(repo, 'docker-compose.prod.yml'), 'services:\n  cv:\n    restart: always\n');
  writeFileSync(
    join(repo, '.env'),
    'IMAGE_TAG_CV=1.0.0\nIMAGE_TAG_CHAT_BACKEND=2.0.0\nIMAGE_TAG_DEPLOYER=1.0.0\n',
  );
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'first');
  git(repo, 'remote', 'add', 'origin', origin);
  git(repo, 'push', '-u', 'origin', 'main');

  // A second clone makes the commit the checkout will have to pull.
  git(root, 'clone', origin, other);
  writeFileSync(join(other, 'docker-compose.yml'), 'services:\n  cv:\n    image: second\n');
  writeFileSync(join(other, 'app.js'), 'console.log("new frontend");\n');
  git(other, 'add', '.');
  git(other, 'commit', '-m', 'second');
  git(other, 'push', 'origin', 'main');

  const env = { ...GIT_ENV, PATH: `${bin}:${process.env.PATH}`, STUB_LOG: log };

  // The script works on the directory it lives in, so it has to live in the
  // sandbox - a symlink keeps it reading the real file while pointing the
  // script at the checkout under test.
  symlinkSync(SCRIPT, join(repo, 'cv-update.sh'));

  return {
    repo,
    run: (args = []) =>
      spawnSync('bash', ['cv-update.sh', ...args], {
        cwd: repo,
        env,
        encoding: 'utf8',
      }),
    log: () => readFileSync(log, 'utf8'),
    env: (key) => {
      const line = readFileSync(join(repo, '.env'), 'utf8')
        .split('\n')
        .find((entry) => entry.startsWith(`${key}=`));
      return line ? line.slice(key.length + 1) : '';
    },
    head: () => git(repo, 'rev-parse', '--short=7', 'HEAD'),
  };
}

after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe('cv-update.sh', () => {
  it('follows the branch, pins the commit and pulls the images', () => {
    const site = sandbox();
    const run = site.run();
    assert.equal(run.status, 0, run.stderr);

    // The working tree moved: the old checkout problem cannot happen unnoticed.
    assert.match(readFileSync(join(site.repo, 'app.js'), 'utf8'), /new frontend/);

    const sha = site.head();
    assert.match(sha, /^[0-9a-f]{7}$/);
    for (const key of ['IMAGE_TAG_CV', 'IMAGE_TAG_CHAT_BACKEND', 'IMAGE_TAG_DEPLOYER']) {
      assert.equal(site.env(key), `sha-${sha}`, `${key} points at the new commit`);
    }

    const log = site.log();
    assert.match(log, /docker compose -f docker-compose\.yml -f docker-compose\.prod\.yml pull/);
    assert.match(
      log,
      /docker compose -f docker-compose\.yml -f docker-compose\.prod\.yml up -d --remove-orphans/,
    );
  });

  it('checks the frontend it just deployed, service worker included', () => {
    const site = sandbox();
    const run = site.run();
    assert.equal(run.status, 0, run.stderr);

    for (const path of ['/', '/sw.js', '/manifest.webmanifest', '/api/health']) {
      assert.match(
        site.log(),
        new RegExp(`curl [^\\n]*127\\.0\\.0\\.1:3036${path.replace('/', '\\/')}`),
      );
    }
    assert.match(run.stdout, /\/sw\.js → 200/);
  });

  it('can skip the pull for a host that builds its own images', () => {
    const site = sandbox();
    const run = site.run(['--no-pull']);
    assert.equal(run.status, 0, run.stderr);

    assert.ok(!site.log().includes('pull'), 'no pull was attempted');
    assert.match(site.log(), /up -d --remove-orphans/, 'the stack still restarts');
  });

  it('stops with a clear message when the checkout has local changes', () => {
    const site = sandbox();
    // The incoming commit touches this file, so a fast-forward is impossible.
    writeFileSync(join(site.repo, 'docker-compose.yml'), 'services:\n  cv:\n    image: edited\n');

    const run = site.run();

    assert.notEqual(run.status, 0, 'a dirty checkout is not silently ignored');
    assert.match(run.stderr, /git pull failed/);
    assert.ok(!site.log().includes('up -d'), 'nothing was started');
  });
});
