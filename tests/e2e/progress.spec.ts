// Проверяет смысл общего прогресса через пользовательские действия, включая обратные переходы.
import { expect, test, type Page } from "@playwright/test";

/** Начинает интервью и оставляет первый вопрос в выбранном голосовом состоянии. */
async function begin(page: Page) {
  await page.goto("/");
  if (
    !(await page.getByRole("button", { name: "Добавить вакансию" }).isVisible())
  )
    await page.getByRole("button", { name: "Открыть список вакансий" }).click();
  await page.getByRole("button", { name: "Добавить вакансию" }).click();
  await page.getByRole("button", { name: "Начать интервью" }).click();
}

/** Подтверждает осознанно неизвестный ответ; он завершает тему, но не создаёт конкретные сведения. */
async function confirmUnknown(page: Page) {
  await page.getByRole("button", { name: "Написать текстом" }).click();
  await page.getByRole("button", { name: "Пока не знаю", exact: true }).click();
  await page.getByRole("button", { name: "Подтвердить без проверки" }).click();
}

test("кольцо проходит четыре четверти, сохраняется при навигации и следует правке/отмене", async ({
  page,
}) => {
  await begin(page);
  const ring = page.getByRole("progressbar", { name: "Прогресс интервью" });
  await expect(page.getByLabel("Ваш ответ", { exact: true })).toBeHidden();
  await expect(ring).toHaveAttribute("aria-valuenow", "0");
  for (let completed = 1; completed <= 4; completed++) {
    await confirmUnknown(page);
    await expect(ring).toHaveAttribute("aria-valuenow", String(completed));
    await expect(page.locator(".progress-segment.is-filled")).toHaveCount(
      completed * 15,
    );
  }
  await expect(
    page.getByRole("heading", { name: "Проверьте общую картину" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Задачи", exact: true }).click();
  await expect(ring).toHaveAttribute("aria-valuenow", "4");
  await page.getByLabel("Ваш ответ", { exact: true }).fill("Новая задача");
  await expect(ring).toHaveAttribute("aria-valuenow", "3");
  await expect(page.locator(".progress-segment.is-filled")).toHaveCount(45);
  await page
    .getByRole("button", { name: "Отменить изменения", exact: true })
    .click();
  await expect(ring).toHaveAttribute("aria-valuenow", "4");
  await expect(page.getByLabel("Ваш ответ", { exact: true })).toHaveValue(
    "Пока не знаю",
  );
  await page.getByRole("button", { name: "Завершить", exact: true }).click();
  await page.getByRole("button", { name: "Создать тестовый черновик" }).click();
  await expect(page.locator(".feedback")).toContainText(
    "недостаточно сведений",
  );
  await expect(ring).toHaveAttribute("aria-valuenow", "4");
});

test("запись, распознавание и оценка не подтверждают тему за человека", async ({
  page,
}) => {
  await begin(page);
  const ring = page.getByRole("progressbar", { name: "Прогресс интервью" });
  await page
    .getByRole("button", { name: "Начать запись", exact: true })
    .click();
  await expect(ring).toHaveAttribute("aria-valuenow", "0");
  await page.getByRole("button", { name: "Завершить", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Оставить как есть" }).click();
  await page
    .getByRole("button", { name: "Остановить запись", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Использовать текст", exact: true })
    .click();
  await expect(ring).toHaveAttribute("aria-valuenow", "0");
  await page
    .getByRole("button", { name: "Проверить ответ", exact: true })
    .click();
  await expect(page.getByText("В примере есть нужные сведения")).toBeVisible();
  await expect(
    page.getByText("Есть сведения: 2 из 2; явно неизвестно: 0"),
  ).toBeVisible();
  await expect(ring).toHaveAttribute("aria-valuenow", "0");
  await page.getByRole("button", { name: "Подтвердить и далее" }).click();
  await expect(ring).toHaveAttribute("aria-valuenow", "1");
});

test("анимация заполнения имеет последовательность, reduced motion убирает движение", async ({
  page,
}) => {
  await begin(page);
  await confirmUnknown(page);
  await expect(page.locator(".progress-segment.is-filled")).toHaveCount(15);
  const delays = await page
    .locator(".progress-segment.is-filled")
    .evaluateAll((nodes) =>
      nodes.map((node) => parseFloat(getComputedStyle(node).transitionDelay)),
    );
  expect(delays[14]).toBeGreaterThan(delays[0]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await confirmUnknown(page);
  expect(
    await page
      .locator(".progress-segment")
      .first()
      .evaluate((node) => getComputedStyle(node).transitionDuration),
  ).toBe("0s");
  await page
    .getByRole("button", { name: "Начать запись", exact: true })
    .click();
  expect(
    await page
      .locator(".glass-surface")
      .evaluate((node) => getComputedStyle(node).animationName),
  ).toBe("none");
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "2",
  );
});
