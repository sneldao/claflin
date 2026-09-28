import { defineConfig, devices } from '@playwright/test';

/* CI pins IPv4 end to end: GitHub runners export HOSTNAME (the machine
   name), which the standalone server would otherwise bind to, and
   `localhost` may resolve to ::1. */
const BASE_URL = process.env.CI ? 'http://127.0.0.1:3000' : 'http://localhost:3000';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60 * 1000,
  expect: { timeout: 30 * 1000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  webServer: {
    /* CI builds once in a prior step and serves the production bundle —
       a dev server's first-request compiles would eat the test timeouts.
       `postbuild` prunes .next/server under NODE_ENV=production, so the
       standalone server is the only runnable production output. */
    command: process.env.CI ? 'node .next/standalone/server.js' : 'pnpm dev',
    ...(process.env.CI ? { env: { PORT: '3000', HOSTNAME: '127.0.0.1' } } : {}),
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 300 * 1000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
