import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:8080',
    headless: true,
    screenshot: 'on',
    video: 'off',
    // Accept self-signed certs if needed
    ignoreHTTPSErrors: true,
  },
  outputDir: './tests/screenshots',
  reporter: [['list']],
});
