// Браузерные проходы проверяют доступный сценарий на фикстурах и отсутствие внешней обработки.
import { expect, test, type Page } from "@playwright/test";
import { topics } from "../../src/domain/fixtures";
import AxeBuilder from "@axe-core/playwright";

/** Начинает новый сеанс через видимое объяснение ограничений. */
async function begin(page: Page, edit = true) {
  await page.goto("/");
  if (
    !(await page.getByRole("button", { name: "Добавить вакансию" }).isVisible())
  )
    await page.getByRole("button", { name: "Открыть список вакансий" }).click();
  await page.getByRole("button", { name: "Добавить вакансию" }).click();
  await page.getByRole("button", { name: "Начать интервью" }).click();
  if (edit) await openEditor(page);
}
/** Открывает текстовую альтернативу тем же действием, которым пользуется человек. */
async function openEditor(page: Page) {
  const toggle = page.getByRole("button", { name: "Написать текстом" });
  if (await toggle.isVisible()) await toggle.click();
}
/** Заполняет весь путь примерами, не обходя явные подтверждения. */
async function finishAnswers(page: Page) {
  for (let i = 0; i < 4; i++) {
    await openEditor(page);
    await page
      .getByRole("button", { name: "Вставить пример", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Проверить ответ", exact: true })
      .click();
    await expect(
      page.getByText("В примере есть нужные сведения"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Подтвердить и далее" }).click();
  }
}

test("полный проход, редактирование, экспорт и отсутствие внешних запросов", async ({
  page,
}) => {
  const origin = new URL(test.info().project.use.baseURL!).origin;
  const unexpected: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== origin)
      unexpected.push(request.url());
  });
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new Error("Микрофон не должен запрашиваться");
    };
  });
  await begin(page);
  await finishAnswers(page);
  await expect(
    page.getByRole("heading", { name: "Проверьте общую картину" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Создать тестовый черновик" }).click();
  await expect(
    page.getByRole("heading", { name: "Основа вакансии готова" }),
  ).toBeVisible();
  await page
    .getByLabel("Ежедневные задачи", { exact: true })
    .fill("Мой исправленный текст");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Скачать черновик", exact: true })
    .click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("черновик-вакансии.txt");
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8");
  expect(text).toContain("Мой исправленный текст");
  expect(text).toContain("изменено вручную");
  expect(unexpected).toEqual([]);
});

test("тестовая запись, отмена и сохранение текста", async ({ page }) => {
  await begin(page);
  await page.getByLabel("Ваш ответ", { exact: true }).fill("Мой текст");
  await page.getByRole("button", { name: "Начать запись" }).click();
  await page
    .getByRole("button", { name: "Остановить запись", exact: true })
    .click();
  await expect(
    page.getByText("Тестовая расшифровка", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Ваш ответ", { exact: true })).toHaveValue(
    "Мой текст",
  );
  await page.getByRole("button", { name: "Оставить свой текст" }).click();
  await expect(page.getByLabel("Ваш ответ", { exact: true })).toHaveValue(
    "Мой текст",
  );
});

test("одно уточнение и явное добавление текста", async ({ page }) => {
  await begin(page);
  await page.getByText("Проверка тестового сценария", { exact: true }).click();
  await page
    .getByRole("button", { name: "Пример с нехваткой конкретики" })
    .click();
  await page
    .getByRole("button", { name: "Проверить ответ", exact: true })
    .click();
  await page.getByRole("button", { name: "Дополнить текстом" }).click();
  const original = await page
    .getByLabel("Ваш ответ", { exact: true })
    .inputValue();
  await page
    .getByRole("button", { name: "Вставить пример дополнения" })
    .click();
  await page
    .getByRole("button", { name: "Добавить к ответу", exact: true })
    .click();
  await expect(page.getByLabel("Ваш ответ", { exact: true })).toHaveValue(
    original + "\n" + topics[0].sample,
  );
  await page
    .getByRole("button", { name: "Проверить ответ", exact: true })
    .click();
  await expect(page.getByText("В примере есть нужные сведения")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Дополнить текстом" }),
  ).toHaveCount(0);
});

test("ошибка, тайм-аут и правка во время ожидания сохраняют текст", async ({
  page,
}) => {
  await begin(page);
  await page
    .getByRole("button", { name: "Вставить пример", exact: true })
    .click();
  await page.getByText("Проверка тестового сценария", { exact: true }).click();
  for (const outcome of ["error", "timeout"]) {
    await page.getByLabel("Следующая тестовая операция").selectOption(outcome);
    await page
      .getByRole("button", { name: "Проверить ответ", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      outcome === "error" ? "недоступен" : "время ожидания истекло",
    );
    await expect(page.getByLabel("Ваш ответ", { exact: true })).toHaveValue(
      topics[0].sample,
    );
  }
  await page
    .getByRole("button", { name: "Проверить ответ", exact: true })
    .click();
  await page.getByLabel("Ваш ответ", { exact: true }).fill("Новая версия");
  await page.waitForTimeout(800);
  await expect(page.getByText("В примере есть нужные сведения")).toHaveCount(0);
  await expect(page.getByLabel("Ваш ответ", { exact: true })).toHaveValue(
    "Новая версия",
  );
});

test("устаревший черновик и отмена сброса сохраняют правки", async ({
  page,
}) => {
  await begin(page);
  await finishAnswers(page);
  await page.getByRole("button", { name: "Создать тестовый черновик" }).click();
  await page
    .getByLabel("Ежедневные задачи", { exact: true })
    .fill("Мои задачи");
  await page.getByRole("button", { name: "Задачи", exact: true }).click();
  await page
    .getByLabel("Ваш ответ", { exact: true })
    .fill("Изменённый источник");
  await page.getByRole("button", { name: "Открыть черновик" }).click();
  await expect(
    page.getByText("Ответы изменились — черновик устарел"),
  ).toBeVisible();
  await expect(
    page.getByLabel("Ежедневные задачи", { exact: true }),
  ).toHaveValue("Мои задачи");
  await page.getByText("Проверка тестового сценария", { exact: true }).click();
  await page.getByRole("button", { name: "Сбросить интервью" }).click();
  await page.getByRole("button", { name: "Оставить как есть" }).click();
  await expect(
    page.getByLabel("Ежедневные задачи", { exact: true }),
  ).toHaveValue("Мои задачи");
});

test("неизвестные ответы не создают вымышленную вакансию", async ({ page }) => {
  await begin(page);
  for (let i = 0; i < 4; i++) {
    await openEditor(page);
    await page
      .getByRole("button", { name: "Пока не знаю", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Подтвердить без проверки" })
      .click();
  }
  await page.getByRole("button", { name: "Создать тестовый черновик" }).click();
  await expect(page.locator(".feedback")).toContainText(
    "недостаточно сведений",
  );
  await expect(
    page.getByRole("button", { name: "Скачать сводку", exact: true }),
  ).toBeEnabled();
});

for (const width of [360, 768, 1440])
  test(`первый экран ${width}px и reduced motion`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await begin(page, false);
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .locator(".question-panel")
        .evaluate((el) => getComputedStyle(el).animationName),
    ).toBe("none");
    await page.screenshot({
      path: testInfo.outputPath(`first-screen-${width}.png`),
      fullPage: true,
    });
  });

// Автоматическая доступность дополняет проверку фокуса, но не заменяет настоящий screen reader.
test("доступность и клавиатура на начале, вопросе и результате", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  await page.goto("/");
  if (
    !(await page.getByRole("button", { name: "Добавить вакансию" }).isVisible())
  )
    await page.getByRole("button", { name: "Открыть список вакансий" }).click();
  await page.getByRole("button", { name: "Добавить вакансию" }).click();
  await page.screenshot({
    path: testInfo.outputPath("intro.png"),
    fullPage: true,
  });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await page.getByRole("button", { name: "Начать интервью" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Начать запись" }),
  ).toBeFocused();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await finishAnswers(page);
  await page.getByRole("button", { name: "Создать тестовый черновик" }).click();
  await expect(
    page.getByRole("heading", { name: "Основа вакансии готова" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("result.png"),
    fullPage: true,
  });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await page.getByText("Проверка тестового сценария", { exact: true }).click();
  await page.getByRole("button", { name: "Сбросить интервью" }).click();
  await expect(
    page.getByRole("button", { name: "Оставить как есть" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Сбросить интервью" }),
  ).toBeFocused();
});
