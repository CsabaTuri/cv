import { defineConfig, devices } from '@playwright/test';

// The end-to-end tests drive the real thing: the exported site (served by
// tests/e2e/server.mjs, which mirrors cv/nginx.conf) talking to the real chat
// backend with a real MySQL underneath. Nothing is mocked.
//
//   npm --prefix cv run build     # the export has to exist first
//   npx playwright test           # DB_HOST/DB_PORT/... as for the unit tests
//
// In CI the MySQL service is on 127.0.0.1:3306 (see .github/workflows/ci.yml);
// locally the test container usually listens on 127.0.0.1:3307.

const API_PORT = Number(process.env.E2E_API_PORT ?? 3100);
const SITE_PORT = Number(process.env.E2E_SITE_PORT ?? 3101);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? 'ci-admin-token';

const database = {
  DB_HOST: process.env.DB_HOST ?? '127.0.0.1',
  DB_PORT: process.env.DB_PORT ?? '3306',
  DB_NAME: process.env.DB_NAME ?? 'cv_chat_test',
  DB_USER: process.env.DB_USER ?? 'chat',
  DB_PASSWORD: process.env.DB_PASSWORD ?? 'chat',
};

export default defineConfig({
  testDir: './tests/e2e',
  // The export can only handle one build at a time, and every test works on its
  // own conversation, so a couple of workers is enough to keep it quick.
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },

  // The second reporter writes the same JUnit XML the unit suite produces, so
  // .github/scripts/test-summary.mjs can report on both in the same way.
  reporter: process.env.CI
    ? [
        ['list'],
        ['junit', { outputFile: 'test-results/playwright-junit.xml' }],
        ['html', { open: 'never' }],
      ]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: `http://127.0.0.1:${SITE_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    // The visitor session lives in localStorage; a fresh context per test keeps
    // the tests from sharing a conversation by accident.
    storageState: undefined,
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      command: 'node chat-backend/server.js',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { ...process.env, ...database, PORT: String(API_PORT), ADMIN_TOKEN },
    },
    {
      command: 'node tests/e2e/server.mjs',
      url: `http://127.0.0.1:${SITE_PORT}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        ...process.env,
        E2E_API_URL: `http://127.0.0.1:${API_PORT}`,
        E2E_SITE_PORT: String(SITE_PORT),
      },
    },
  ],
});
