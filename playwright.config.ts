// Проходы проверяют собранный сайт, а не отдельный dev-экран.
import { defineConfig, devices } from "@playwright/test";
// Порт тестового сервера можно вынести отдельно от уже открытого локального демо.
const testPort = process.env.E2E_PORT ?? "4317";
const baseURL = "http://127.0.0.1:" + testPort;
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: 4,
  retries: 0,
  use: { baseURL, trace: "retain-on-failure" },
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
    url: baseURL,
    reuseExistingServer: false,
    env: { AI_ENABLED: "false", PORT: testPort },
  },
});
