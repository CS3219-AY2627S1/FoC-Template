import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173",
    screenshot: "only-on-failure",
    // Live authentication exchanges contain credentials/tokens. Keep those out
    // of saved network traces; retain failure screenshots and service logs.
    trace: process.env.CHAT_LIVE_E2E === "1" ? "off" : "retain-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev -- --host 127.0.0.1",
        url: "http://127.0.0.1:5173",
        reuseExistingServer: !process.env.CI,
      },
});
