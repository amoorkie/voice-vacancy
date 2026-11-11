// Проходы проверяют собранный сайт, а не отдельный dev-экран.
import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: 4,
  retries: 0,
  use: { baseURL: "http://127.0.0.1:4317", trace: "retain-on-failure" },
  projects: process.env.TEST_BROWSER
    ? process.env.TEST_BROWSER.split(",").map((channel) => ({
        name: channel,
        use: {
          ...devices["Desktop Chrome"],
          channel,
        },
      }))
    : [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm start",
    url: "http://127.0.0.1:4317",
    reuseExistingServer: false,
    env: { AI_ENABLED: "false" },
  },
});
