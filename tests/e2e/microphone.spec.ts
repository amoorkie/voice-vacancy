// Проверяю регрессию: реальный аудиопоток браузера не подменяется готовым ответом.
import { chromium, expect, test } from "@playwright/test";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { encodeWave } from "../../src/client/interview/microphone";

for (const silent of [true, false]) {
  test(
    silent
      ? "тишина не создаёт ответ и не двигает прогресс"
      : "микрофон отправляет WAV, текст приходит от распознавателя",
    async ({ baseURL }, info) => {
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
      let releaseTranscription!: () => void;
      const transcriptionReady = new Promise<void>((resolve) => {
        releaseTranscription = resolve;
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
          await transcriptionReady;
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
                    getComputedStyle(node).getPropertyValue("--voice-level"),
                  ),
                ),
            )
            .toBeGreaterThan(0);
        // AudioWorklet должен успеть принять блоки и для проверки полностью беззвучного потока.
        await page.waitForTimeout(1100);
        const tick = await page
          .locator(".ix-voice .progress-segment")
          .first()
          .evaluate((node) => {
            const animation = node.getAnimations()[0];
            animation.pause();
            animation.currentTime = 1440;
            return {
              level: Number(
                getComputedStyle(node).getPropertyValue("--voice-level"),
              ),
              length: new DOMMatrix(getComputedStyle(node).transform).d,
            };
          });
        // Сравниваю один и тот же гребень волны: различие должно приходить именно от микрофона.
        if (silent) {
          expect(tick.level).toBe(0);
          expect(tick.length).toBeCloseTo(1.18, 2);
        } else {
          expect(tick.level).toBeGreaterThan(0);
          expect(tick.length).toBeGreaterThan(1.18);
        }
        await page.getByRole("button", { name: "Остановить запись" }).click();
        const answer = page.getByLabel("Расшифровка", { exact: true });
        if (!silent) {
          await expect(page.locator(".ix-transcription")).toBeVisible();
          await expect(page.getByRole("status")).toContainText(
            "Распознаю речь",
          );
          await expect(
            page.getByRole("button", { name: "Отменить", exact: true }),
          ).toBeVisible();
          releaseTranscription();
        }
        if (silent) {
          await expect(page.getByRole("status")).toContainText(
            "Речь не обнаружена",
          );
          await expect(answer).toHaveValue("");
          expect(uploads).toBe(0);
          await expect(page.locator(".ix-topic-check")).toHaveCount(0);
          await expect(
            page.getByRole("button", { name: "Подтвердить ответ" }),
          ).toHaveCount(0);
        } else {
          await expect(page.getByRole("progressbar")).toHaveAttribute(
            "aria-valuenow",
            "1",
          );
          await expect(answer).toHaveValue("");
          await expect(page.locator(".ix-question h3")).toBeFocused();
          const saved = page.getByLabel("Задачи", { exact: true });
          await expect(saved).toHaveValue(
            "Это распознанная речь, полученная с сервера.",
          );
          await expect(saved).toBeVisible();
          await expect(saved).toBeEditable();
          await page.getByRole("button", { name: /Задачи — Готово/ }).click();
          await expect(answer).toHaveValue(
            "Это распознанная речь, полученная с сервера.",
          );
          expect(uploads).toBe(1);
          await expect(page.locator(".ix-topic-check")).toHaveCount(1);
          await expect(
            page.locator(".ix-topics button").first().locator(".ix-topic-dot"),
          ).toHaveCount(0);
        }
        await expect(page.getByRole("progressbar")).toHaveAttribute(
          "aria-valuenow",
          silent ? "0" : "1",
        );
      } finally {
        releaseTranscription();
        await browser.close();
      }
    },
  );
}
