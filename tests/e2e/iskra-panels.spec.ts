// Проверяю путь из кабинета, движение двух слоёв и сохранность текста при возврате и сбое.
import { expect, test, type Page, type Locator } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { workspaceSamples, unknownAnswer } from "../../src/domain/fixtures";

/** Открывает настоящий вход и на телефоне раскрывает меню вакансий. */
async function enter(page: Page) {
  await page.goto("/");
  if (
    !(await page.getByRole("button", { name: "Добавить вакансию" }).isVisible())
  )
    await page.getByRole("button", { name: "Открыть список вакансий" }).click();
  await page.getByRole("button", { name: "Добавить вакансию" }).click();
  await expect(
    page.getByRole("heading", { name: "Создание вакансии", exact: true }),
  ).toBeFocused();
}
/** Заполняет редактор и подтверждает тему через обычное действие на круге. */
async function confirm(page: Page, sample = "Вставить пример") {
  if (sample === "Пока не знаю")
    await page.getByRole("button", { name: sample, exact: true }).click();
  else {
    const index = await page
      .locator(".ix-topics button")
      .evaluateAll((buttons) =>
        buttons.findIndex(
          (button) => button.getAttribute("aria-current") === "step",
        ),
      );
    await page
      .getByLabel("Расшифровка", { exact: true })
      .fill(workspaceSamples[index]);
  }
  await page.getByRole("button", { name: "Подтвердить ответ" }).click();
}
/** Замеряет каждый доступный кадр, начиная до действия и заканчивая после CSS-перехода. */
async function measure(button: Locator) {
  return button.evaluate(async (node) => {
    const right = document.querySelector(".ix-interview")!;
    const left = document.querySelector(".ix-preview")!;
    const frame = () => {
      const { x, y, width, height } = right.getBoundingClientRect();
      return {
        right: [x, y, width, height],
        left: left.getBoundingClientRect().x,
      };
    };
    const frames = [frame()];
    (node as HTMLButtonElement).click();
    const start = performance.now();
    do {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      frames.push(frame());
    } while (performance.now() - start < 440);
    return frames;
  });
}
test("четыре подтверждения, неподвижное интервью и выезд превью влево", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await enter(page);
  const ring = page.getByRole("progressbar");
  const create = page.getByRole("button", { name: "Создать черновик" });
  for (let i = 0; i < 4; i++) {
    await expect(ring).toHaveAttribute("aria-valuenow", String(i));
    await expect(create).toHaveCount(0);
    await confirm(page);
  }
  await expect(ring).toHaveAttribute("aria-valuenow", "4");
  await create.focus();
  const forward = await measure(create);
  const role = page.getByRole("textbox", {
    name: "Название вакансии",
    exact: true,
  });
  const article = page.getByRole("article");
  await expect(
    article.getByRole("heading", { name: "Frontend-разработчик" }),
  ).toBeVisible();
  await expect(article.getByRole("listitem").first()).toBeVisible();
  await expect(role).toBeEditable();
  await expect(
    article.getByRole("textbox", { name: "Условия работы" }),
  ).toBeEditable();
  expect(
    await page
      .locator(".ix-preview")
      .evaluate((n) => getComputedStyle(n).borderRadius),
  ).toBe("24px 0px 0px 24px");
  await expect(page.getByRole("button", { name: "Редактировать" })).toHaveCount(
    0,
  );
  expect(forward[0].left - forward.at(-1)!.left).toBe(720);
  expect(
    forward.some(
      (f) => f.left > forward.at(-1)!.left + 1 && f.left < forward[0].left - 1,
    ),
  ).toBe(true);
  await role.fill("Моя редакция роли");
  await expect(
    article.getByRole("heading", { name: "Моя редакция роли" }),
  ).toBeVisible();
  const file = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать .txt" }).click();
  const download = await file;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString()).toContain("Моя редакция роли");
  const reverse = await measure(
    page.getByRole("button", { name: "К ответам", exact: true }),
  );
  expect(reverse.at(-1)!.left - reverse[0].left).toBe(720);
  for (const frame of [...forward, ...reverse])
    expect(frame.right).toEqual([864, 16, 560, 868]);
  await page.getByRole("button", { name: /Задачи — Подтверждено/ }).click();
  await page.getByLabel("Расшифровка").fill("Изменилась задача");
  await expect(ring).toHaveAttribute("aria-valuenow", "3");
  await page.getByRole("button", { name: "Открыть черновик" }).click();
  await expect(
    page.getByText("Ответы изменились", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Пересобрать черновик" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Отменить правку" }).click();
  await expect(ring).toHaveAttribute("aria-valuenow", "4");
  await page
    .getByRole("button", { name: /Первое полугодие — Подтверждено/ })
    .click();
  await confirm(page, "Пока не знаю");
  await page.getByRole("button", { name: "Открыть черновик" }).click();
  await expect(
    article.getByRole("heading", { name: "Моя редакция роли" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Пересобрать черновик" }).click();
  await expect(page.getByRole("button", { name: "Остаться" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    article.getByRole("heading", { name: "Моя редакция роли" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Пересобрать черновик" }).click();
  await page.getByRole("button", { name: "Пересобрать", exact: true }).click();
  await expect(
    article.getByRole("heading", { name: /Frontend/ }),
  ).toBeVisible();
  await expect(
    article.getByRole("textbox", { name: "Первые шесть месяцев", exact: true }),
  ).toHaveValue(unknownAnswer);
});

test("запись и ручные правки сохраняются отдельно от подтверждения и прогресса", async ({
  page,
}) => {
  await enter(page);
  const answer = page.getByLabel("Расшифровка");
  await answer.fill("Мой термин");
  await page.getByRole("button", { name: "Дополнить запись" }).click();
  await page.getByRole("button", { name: /Первое полугодие —/ }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Добавить к ответу" }).click();
  await expect(answer).toHaveValue("Мой термин\n" + workspaceSamples[0]);
  await page.getByRole("button", { name: "Дополнить запись" }).click();
  await page.getByRole("button", { name: "Остановить запись" }).click();
  await page.getByRole("button", { name: "Заменить текст" }).click();
  await expect(answer).toHaveValue(workspaceSamples[0]);
  await expect(
    page.getByRole("button", { name: "Проверить полноту" }),
  ).toHaveCount(0);
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
  await answer.fill("😀".repeat(6001));
  await expect(
    page.getByRole("button", { name: "Подтвердить ответ" }),
  ).toBeDisabled();
  await answer.fill("😀".repeat(6000));
  await expect(
    page.getByRole("button", { name: "Подтвердить ответ" }),
  ).toBeEnabled();
});

test("ошибка, тайм-аут, нехватка данных и отмена сборки сохраняют ответы", async ({
  page,
}) => {
  await page.clock.install();
  await page.route("**/api/config", (route) =>
    route.fulfill({
      json: { mode: "api", csrfToken: "local-test", model: null },
    }),
  );
  // Сетевые ответы задаются в тесте, без отладочных кнопок в продукте.
  let outcome = "waiting";
  await page.route("**/api/vacancy", async (route) => {
    if (outcome === "waiting") return;
    if (outcome === "error") {
      await route.fulfill({
        status: 503,
        json: { message: "Сервис недоступен. Ваш текст сохранён." },
      });
      return;
    }
    const input = route.request().postDataJSON();
    await route.fulfill({
      json: {
        requestId: input.requestId,
        sessionId: input.sessionId,
        value: outcome === "insufficient" ? "insufficient" : {},
      },
    });
  });
  await enter(page);
  for (let i = 0; i < 4; i++) await confirm(page, "Пока не знаю");
  const create = page.getByRole("button", { name: "Создать черновик" });
  await create.click();
  await expect(page.getByText("Собираю черновик…")).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const animations = await page
    .locator(".ix-loading-symbol svg, .ix-skeleton")
    .evaluateAll((nodes) =>
      nodes.flatMap((node) => [
        getComputedStyle(node).animationName,
        getComputedStyle(node, "::after").animationName,
      ]),
    );
  expect(animations.every((name) => name === "none")).toBe(true);
  await page.keyboard.press("Escape");
  await expect(create).toBeFocused();
  outcome = "error";
  await create.click();
  await expect(page.getByRole("status")).toContainText("Сервис недоступен");
  await page.keyboard.press("Escape");
  outcome = "waiting";
  const request = page.waitForRequest("**/api/vacancy");
  await create.click();
  await request;
  await page.clock.fastForward(60001);
  await expect(page.getByRole("status")).toContainText(
    "Время ожидания истекло",
  );
  await page.keyboard.press("Escape");
  outcome = "insufficient";
  await create.click();
  await expect(page.getByRole("status")).toContainText(
    "Пока недостаточно сведений",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Задачи — Подтверждено/ }).click();
  await expect(page.getByLabel("Расшифровка")).toHaveValue(unknownAnswer);
  await page.getByLabel("Расшифровка").fill("Разобрать новую задачу");
  await page.getByRole("button", { name: "Подтвердить ответ" }).click();
  outcome = "invalid";
  await create.click();
  await expect(page.getByRole("status")).toContainText("Неверный черновик");
  await expect(page.getByRole("button", { name: "Сводка .txt" })).toHaveCount(
    0,
  );
});

test("на телефоне активна одна панель, Escape возвращает к ответам и к кабинету", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await enter(page);
  await expect(
    page.getByRole("navigation", { name: "Темы интервью" }).getByRole("button"),
  ).toHaveCount(4);
  const rows = await page
    .locator(".ix-topics button")
    .evaluateAll((buttons) =>
      buttons.map((button) => Math.round(button.getBoundingClientRect().top)),
    );
  expect(new Set(rows).size).toBe(1);
  await expect(
    page.getByText(/Демо-запись|Темы:|Параметры демо|WikiVibe/),
  ).toHaveCount(0);
  for (const phase of ["interview", "preview"]) {
    if (phase === "preview") {
      for (let i = 0; i < 4; i++) await confirm(page);
      await page.getByRole("button", { name: "Создать черновик" }).click();
      await expect(
        page.getByRole("textbox", {
          name: "Ежедневные задачи, пункт 1",
          exact: true,
        }),
      ).toHaveValue(/Разрабатывать формы/);
      await expect(page.getByRole("progressbar")).toHaveCount(0);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(390);
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      audit.violations.map((v) => [v.id, v.nodes.map((n) => n.target)]),
    ).toEqual([]);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "4",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Открыть список вакансий" }),
  ).toBeFocused();
});

test("двойное нажатие открывает одно превью, прерванный выезд не создаёт черновик", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await enter(page);
  for (let i = 0; i < 4; i++) await confirm(page);
  const create = page.getByRole("button", { name: "Создать черновик" });
  await create.dblclick();
  await expect(
    page.getByRole("button", { name: "Отменить сборку" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(create).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Черновик вакансии" }),
  ).toHaveCount(0);
  await create.click();
  await expect(
    page.getByRole("textbox", {
      name: "Ежедневные задачи, пункт 1",
      exact: true,
    }),
  ).toHaveValue(/Разрабатывать формы/);
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Открыть черновик" }).click();
  await expect(
    page.getByRole("button", { name: "Отменить сборку" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("textbox", {
      name: "Ежедневные задачи, пункт 1",
      exact: true,
    }),
  ).toHaveValue(/Разрабатывать формы/);
});

test("первая запись останавливается и подтверждается одной круглой кнопкой", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  const button = page.locator(".ix-glass");
  await expect(button).toHaveAccessibleName("Начать запись");
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(button).toHaveAccessibleName("Остановить запись");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Расшифровка")).toHaveValue(workspaceSamples[0]);
  await expect(button).toHaveAccessibleName("Подтвердить ответ");
  await expect(button).toBeFocused();
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
  await page.keyboard.press("Enter");
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "1",
  );
  const ticks = page.locator(".ix-voice .is-filled");
  await expect(ticks).toHaveCount(15);
  await expect
    .poll(() => ticks.last().evaluate((n) => getComputedStyle(n).transform))
    .toContain("2.95");
  await expect(button).toHaveAccessibleName("Начать запись");
});

test("правлю статью сразу, разделяю и объединяю пункты, передаю текущую редакцию", async ({
  page,
  context,
}) => {
  await enter(page);
  for (let i = 0; i < 4; i++) await confirm(page);
  await page.getByRole("button", { name: "Создать черновик" }).click();
  const article = page.getByRole("article");
  const field = (name: string) =>
    article.getByRole("textbox", { name, exact: true });
  const title = field("Название вакансии"),
    conditions = field("Условия работы");
  await title.fill("");
  await conditions.fill("Удалённая работа");
  await expect(title).toHaveValue("");
  await expect(conditions).toHaveValue("Удалённая работа");
  await title.fill("Разработчик кабинета");
  const item = (n: number) => field("Ежедневные задачи, пункт " + n);
  await item(1).fill("Писать тесты");
  await item(1).press("End");
  await item(1).press("Enter");
  await expect(item(2)).toBeFocused();
  await page.keyboard.insertText("Проверять формы");
  await expect(item(2)).toHaveValue("Проверять формы");
  await item(2).press("Home");
  await item(2).press("Backspace");
  await expect(item(1)).toHaveValue("Писать тестыПроверять формы");
  await expect(item(1)).toBeFocused();
  await item(1).press("Enter");
  await expect(item(2)).toHaveValue("Проверять формы");
  await item(2).fill("Исправлять формы\nРазбирать обращения");
  await expect(item(3)).toHaveValue("Разбирать обращения");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Копировать", exact: true }).click();
  // Системный буфер Windows использует CRLF. Формат строк проверяем одинаково на всех платформах.
  const text = (
    await page.evaluate(() => navigator.clipboard.readText())
  ).replace(/\r\n/g, "\n");
  expect(text).toContain("Разработчик кабинета\n\nУдалённая работа");
  expect(text).toContain(
    "• Писать тесты\n• Исправлять формы\n• Разбирать обращения",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Открыть черновик" }).click();
  await expect(conditions).toHaveValue("Удалённая работа");
  await expect(item(3)).toHaveValue("Разбирать обращения");
  await page
    .getByRole("button", {
      name: "Вернуть исходный текст: Ежедневные задачи",
      exact: true,
    })
    .click();
  await expect(item(1)).toHaveValue(/Разрабатывать формы/);
  await expect(title).toHaveValue("Разработчик кабинета");
});
