// Проверяем жёсткую границу внешнего API, включая попытку включить его переменной окружения.
import { expect, test } from "vitest";
import { createApp } from "../../src/server/app";
test("все маршруты обработки отключены независимо от AI_ENABLED", async () => {
  const original = process.env.AI_ENABLED;
  process.env.AI_ENABLED = "true";
  const app = createApp(false);
  try {
    for (const path of [
      "transcriptions",
      "completeness",
      "vacancy",
      "unknown",
    ]) {
      const response = await app.inject({
        method: "POST",
        url: `/api/${path}`,
        payload: { text: "Тест" },
      });
      expect(response.statusCode).toBe(503);
      expect(response.json().code).toBe("integration-disabled");
      expect(response.headers["permissions-policy"]).toContain("microphone=()");
    }
    const health = await app.inject({ url: "/health" });
    expect(health.json().externalApi).toBe(false);
  } finally {
    await app.close();
    if (original === undefined) delete process.env.AI_ENABLED;
    else process.env.AI_ENABLED = original;
  }
});

// Публичная конфигурация разрешает ровно адрес владельца, сохраняя запрет постороннего origin.
test("HTTPS origin из конфигурации разрешён, посторонние адреса отклонены", async () => {
  const original = process.env.PUBLIC_ORIGIN;
  process.env.PUBLIC_ORIGIN = "https://amo0orkie.ru";
  const app = createApp(false);
  try {
    const valid = await app.inject({
      url: "/health",
      headers: { host: "amo0orkie.ru", origin: "https://amo0orkie.ru" },
    });
    expect(valid.statusCode).toBe(200);
    const foreign = await app.inject({
      url: "/health",
      headers: { host: "amo0orkie.ru", origin: "https://other.example" },
    });
    expect(foreign.statusCode).toBe(403);
  } finally {
    await app.close();
    if (original === undefined) delete process.env.PUBLIC_ORIGIN;
    else process.env.PUBLIC_ORIGIN = original;
  }
});
