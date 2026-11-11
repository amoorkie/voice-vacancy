// Проверяю регрессию: реальный аудиопоток браузера не подменяется готовым ответом.
import { chromium, expect, test } from "@playwright/test";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { encodeWave } from "../../src/client/interview/microphone";

// Проверяю аудиоустройства последовательно, чтобы не совмещать два новых браузерных аудиосервиса.
test.describe.configure({ mode: "serial" });

for (const silent of [true, false]) {
  test(
    silent
      ? "тишина не создаёт ответ и не двигает прогресс"
      : "микрофон отправляет WAV, текст приходит от распознавателя",
    async ({ baseURL }, info) => {
      // Холодный запуск отдельного браузера с аудиоустройством в CI требует большего общего срока.
      test.setTimeout(60000);
      const file = info.outputPath("microphone.wav");
      await mkdir(dirname(file), { recursive: true });
      const pcm = Float32Array.from({ length: 16000 * 3 }, (_, index) =>
        silent ? 0 : Math.sin((index * Math.PI * 440) / 8000) * 0.2,
      );
      await writeFile(file, encodeWave(pcm));
      const browser = await chromium.launch({
        channel:
          info.project.name === "chromium" ? undefined : info.project.name,
        args: [
          "--use-fake-device-for-media-stream",
          "--use-fake-ui-for-media-stream",
          "--use-file-for-fake-audio-capture=" + file,
        ],
      });
      try {
        const context = await browser.newContext({
          permissions: ["microphone"],
        });
        const page = await context.newPage();
        // Локальный fixture-сервер закрывает микрофон. Для этого прохода задаю политику реального режима.
        await page.route(baseURL + "/", async (route) => {
          const response = await route.fetch();
          await route.fulfill({
            response,
            headers: {
              ...response.headers(),
              "permissions-policy": "microphone=(self), camera=()",
            },
          });
        });
        await page.route("**/api/config", (route) =>
          route.fulfill({
            json: {
              mode: "api",
              csrfToken: "test",
              model: "test",
              voice: "microphone",
            },
          }),
        );
        let uploads = 0;
        await page.route("**/api/transcriptions", async (route) => {
          uploads++;
          const data = route.request().postDataJSON();
          const wave = Buffer.from(data.audio, "base64");
          expect(wave.toString("ascii", 0, 4)).toBe("RIFF");
          expect(wave.readUInt32LE(24)).toBe(16000);
          await route.fulfill({
            json: {
              requestId: data.requestId,
              sessionId: data.sessionId,
              text: "Это распознанная речь, полученная с сервера.",
            },
          });
        });
        await page.goto(baseURL!);
        await page.getByRole("button", { name: "Добавить вакансию" }).click();
        await page.getByRole("button", { name: "Начать запись" }).click();
        if (!silent)
          await expect
            .poll(() =>
              page
                .locator(".ix-glass")
                .evaluate((node) =>
                  Number(
                    (node as HTMLElement).style.getPropertyValue(
                      "--voice-level",
                    ),
                  ),
                ),
            )
            .toBeGreaterThan(0);
        // AudioWorklet должен успеть принять блоки и для проверки полностью беззвучного потока.
        await page.waitForTimeout(1100);
        await page.getByRole("button", { name: "Остановить запись" }).click();
        const answer = page.getByLabel("Расшифровка", { exact: true });
        if (silent) {
          await expect(page.getByRole("status")).toContainText(
            "Речь не обнаружена",
          );
          await expect(answer).toHaveValue("");
          expect(uploads).toBe(0);
          await expect(
            page.getByRole("button", { name: "Подтвердить ответ" }),
          ).toHaveCount(0);
        } else {
          await expect(answer).toHaveValue(
            "Это распознанная речь, полученная с сервера.",
          );
          expect(uploads).toBe(1);
        }
        await expect(page.getByRole("progressbar")).toHaveAttribute(
          "aria-valuenow",
          "0",
        );
      } finally {
        await browser.close();
      }
    },
  );
}
