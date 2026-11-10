// Браузер проверяет реальный клиентский адаптер с подставным серверным ответом, без внешних трат.
import { expect, test, type Page } from "@playwright/test";
import { topics } from "../../src/domain/fixtures";
import { sectionIds } from "../../src/contracts/interview";

/** Раскрывает текстовый ввод перед работой с настоящим клиентским адаптером. */
async function openEditor(page: Page) {
  const toggle = page.getByRole("button", { name: "Написать текстом" });
  if (await toggle.isVisible()) await toggle.click();
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/config", (route) =>
    route.fulfill({
      json: { mode: "api", csrfToken: "test-token", model: "test-model" },
    }),
  );
});

test("API: оценка, подтверждение, черновик с цитатами и ручная редакция", async ({
  page,
}) => {
  await page.route("**/api/completeness", async (route) => {
    const request = route.request().postDataJSON();
    expect(route.request().headers()["x-demo-token"]).toBe("test-token");
    await route.fulfill({
      json: {
        requestId: request.requestId,
        sessionId: request.sessionId,
        value: {
          kind: "ai",
          items: [1, 2].map((i) => ({
            slotId: `Q1.${i}`,
            status: "present",
            evidence: [request.text],
            reason: "Есть сведения",
          })),
          conflicts: [],
        },
      },
    });
  });
  await page.route("**/api/vacancy", async (route) => {
    const request = route.request().postDataJSON();
    const quote = request.answers[0].text;
    await route.fulfill({
      json: {
        requestId: request.requestId,
        sessionId: request.sessionId,
        value: {
          origin: "ai",
          sections: Object.fromEntries(sectionIds.map((id) => [id, quote])),
          sources: Object.fromEntries(sectionIds.map((id) => [id, ["Q1"]])),
          claims: Object.fromEntries(
            sectionIds.map((id) => [
              id,
              [
                {
                  id,
                  kind: "fact",
                  text: quote,
                  sourceRefs: [
                    {
                      questionId: "Q1",
                      confirmedRevision: request.answers[0].confirmedRevision,
                      quote,
                    },
                  ],
                },
              ],
            ]),
          ),
        },
      },
    });
  });
  await page.goto("/?view=interview");
  await expect(
    page.getByText("Проверка и черновик через ваш API", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Начать интервью" }).click();
  await openEditor(page);
  await page.getByLabel("Ваш ответ", { exact: true }).fill(topics[0].sample);
  await page
    .getByRole("button", { name: "Проверить ответ", exact: true })
    .click();
  await expect(page.getByText("В ответе есть нужные сведения")).toBeVisible();
  await page.getByRole("button", { name: "Подтвердить и далее" }).click();
  for (let i = 1; i < 4; i++) {
    await openEditor(page);
    await page.getByLabel("Ваш ответ", { exact: true }).fill(topics[i].sample);
    await page
      .getByRole("button", { name: "Подтвердить без проверки" })
      .click();
  }
  await page
    .getByRole("button", { name: "Создать черновик", exact: true })
    .click();
  await expect(
    page.getByText("ЧЕРНОВИК МОДЕЛИ · ПРОВЕРЬТЕ ФАКТЫ"),
  ).toBeVisible();
  await page
    .getByText("На чём основан раздел", { exact: true })
    .first()
    .click();
  await expect(page.locator("blockquote").first()).toHaveText(topics[0].sample);
  await page
    .getByLabel("Роль и известные условия", { exact: true })
    .fill("Моя роль");
  await expect(
    page.getByText("Изменено вручную", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".result-section").first().locator("details"),
  ).toHaveCount(0);
});

test("API: ошибка провайдера оставляет ответ, без подстановки фикстуры", async ({
  page,
}) => {
  await page.route("**/api/completeness", (route) =>
    route.fulfill({
      status: 503,
      json: {
        code: "provider-model",
        message:
          "Модель не подключена к провайдеру в вашей группе API. Ваш текст сохранён.",
      },
    }),
  );
  await page.goto("/?view=interview");
  await page.getByRole("button", { name: "Начать интервью" }).click();
  await openEditor(page);
  await page
    .getByLabel("Ваш ответ", { exact: true })
    .fill("Мой произвольный ответ");
  await page
    .getByRole("button", { name: "Проверить ответ", exact: true })
    .click();
  await expect(page.locator(".feedback")).toContainText("Модель не подключена");
  await expect(page.getByLabel("Ваш ответ", { exact: true })).toHaveValue(
    "Мой произвольный ответ",
  );
  await expect(page.locator(".evaluation")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Подтвердить без проверки" }),
  ).toBeEnabled();
});
