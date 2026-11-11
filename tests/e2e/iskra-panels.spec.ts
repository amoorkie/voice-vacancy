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
/** Подтверждает тему так же, как это делает руководитель в демо. */
async function confirm(page: Page, sample = "Вставить пример") {
  await page.getByRole("button", { name: sample, exact: true }).click();
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
  const role = page.getByLabel("Роль и известные условия");
  await expect(role).toHaveValue(/Frontend/);
  await expect(page.locator(".ix-preview textarea")).toHaveCount(6);
  expect(forward[0].left - forward.at(-1)!.left).toBe(720);
  expect(
    forward.some(
      (f) => f.left > forward.at(-1)!.left + 1 && f.left < forward[0].left - 1,
    ),
  ).toBe(true);
  await role.fill("Моя редакция роли");
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
  await expect(role).toHaveValue("Моя редакция роли");
  await page.getByRole("button", { name: "Пересобрать черновик" }).click();
  await expect(page.getByRole("button", { name: "Остаться" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(role).toHaveValue("Моя редакция роли");
  await page.getByRole("button", { name: "Пересобрать черновик" }).click();
  await page.getByRole("button", { name: "Пересобрать", exact: true }).click();
  await expect(role).toHaveValue(/Frontend/);
  await expect(page.getByLabel("Первые шесть месяцев")).toHaveValue(
    unknownAnswer,
  );
});

test("запись и ручные правки сохраняются отдельно от подтверждения и прогресса", async ({
  page,
}) => {
  await enter(page);
  const answer = page.getByLabel("Расшифровка");
  await answer.fill("Мой термин");
  await page.getByRole("button", { name: "Начать запись" }).click();
  await page.getByRole("button", { name: /Первое полугодие —/ }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Добавить к ответу" }).click();
  await expect(answer).toHaveValue("Мой термин\n" + workspaceSamples[0]);
  await page.getByRole("button", { name: "Начать запись" }).click();
  await page.getByRole("button", { name: "Остановить запись" }).click();
  await page.getByRole("button", { name: "Заменить текст" }).click();
  await page.getByRole("button", { name: "Проверить полноту" }).click();
  await expect(page.getByText("Ответ полный", { exact: true })).toBeVisible();
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
  await enter(page);
  for (let i = 0; i < 4; i++) await confirm(page, "Пока не знаю");
  const create = page.getByRole("button", { name: "Создать черновик" });
  await create.click();
  await expect(page.getByText("Собираю черновик…")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(create).toBeFocused();
  await page.getByText("Параметры демо").click();
  for (const [outcome, message] of [
    ["error", "Тестовый сервис недоступен"],
    ["timeout", "Тестовое время ожидания истекло"],
  ]) {
    await page.getByLabel("Следующая операция").selectOption(outcome);
    await create.click();
    await expect(page.getByRole("status")).toContainText(message);
    await page.keyboard.press("Escape");
  }
  await create.click();
  await expect(page.getByRole("status")).toContainText(
    "Пока недостаточно сведений",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Задачи — Подтверждено/ }).click();
  await page.getByLabel("Расшифровка").fill("Разобрать новую задачу");
  await page.getByRole("button", { name: "Подтвердить ответ" }).click();
  await create.click();
  await expect(page.getByRole("status")).toContainText(
    "Для этого набора нет готового",
  );
  await expect(page.getByRole("button", { name: "Сводка .txt" })).toBeEnabled();
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
  for (const phase of ["interview", "preview"]) {
    if (phase === "preview") {
      for (let i = 0; i < 4; i++) await confirm(page);
      await page.getByRole("button", { name: "Создать черновик" }).click();
      await expect(page.getByLabel("Ежедневные задачи")).toHaveValue(
        workspaceSamples[0],
      );
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
  await expect(page.getByLabel("Ежедневные задачи")).toHaveValue(
    workspaceSamples[0],
  );
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Открыть черновик" }).click();
  await expect(
    page.getByRole("button", { name: "Отменить сборку" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Ежедневные задачи")).toHaveValue(
    workspaceSamples[0],
  );
});
