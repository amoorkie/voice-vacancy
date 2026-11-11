// Пользовательские переходы кабинета, включая сохранение выбора при возврате.
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("кабинет, фильтры, пустые состояния и раздельные списки откликов", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Frontend Engineer" }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations.map((v) => v.id),
  ).toEqual([]);
  await page.getByRole("button", { name: "Все отклики" }).click();
  await expect(page.getByRole("table").first().getByRole("row")).toHaveCount(
    13,
  );
  await page.getByRole("button", { name: /Продуктовый дизайнер/ }).click();
  await page.getByRole("button", { name: "Все отклики" }).click();
  await expect(page.getByRole("table").first().getByRole("row")).toHaveCount(5);
  const status = page.getByRole("combobox", { name: "Статус вакансий" });
  await status.click();
  await page.getByRole("option", { name: "Черновики" }).click();
  await expect(status).toContainText("Черновики");
  await status.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(status).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Откликов пока нет" }),
  ).toBeVisible();
  await page.getByLabel("Поиск вакансий").fill("нет такой должности");
  await expect(
    page.getByRole("heading", { name: "Вакансии не найдены" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Сбросить фильтры" }).click();
  await expect(
    page.getByRole("heading", { name: "Продуктовый дизайнер" }),
  ).toBeVisible();
});

test("вход в интервью и возврат без потери выбранной вакансии", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/");
  await page.getByRole("button", { name: /Backend Engineer/ }).click();
  await page.getByRole("button", { name: "Добавить вакансию" }).click();
  await expect(
    page.getByRole("button", { name: "Подключить существующую" }),
  ).toHaveCount(0);
  await expect(page.getByText("Демо-данные")).toHaveCount(0);
  await page
    .getByLabel("Расшифровка", { exact: true })
    .fill("Поддерживать интеграции");
  await page.getByRole("button", { name: "В кабинет" }).click();
  await page.getByRole("button", { name: "Остаться" }).click();
  await expect(page.getByLabel("Расшифровка", { exact: true })).toHaveValue(
    "Поддерживать интеграции",
  );
  await page.getByRole("button", { name: "В кабинет" }).click();
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Backend Engineer" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Добавить вакансию" }),
  ).toBeFocused();
  expect(
    requests.filter(
      (url) =>
        new URL(url).origin !== new URL(page.url()).origin ||
        (url.includes("/api/") && !url.endsWith("/api/config")),
    ),
  ).toEqual([]);
});

test("на телефоне открываю список вакансий, выбираю роль и начинаю интервью", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/");
  const menu = page.getByRole("button", { name: "Открыть список вакансий" });
  await menu.click();
  await page.getByRole("button", { name: /QA Engineer/ }).click();
  await expect(
    page.getByRole("heading", { name: "QA Engineer" }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    360,
  );
  await menu.click();
  await page.getByRole("button", { name: "Добавить вакансию" }).click();
  await expect(
    page.getByRole("button", { name: "Начать запись" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "В кабинет" }).click();
  await expect(menu).toBeFocused();
});
