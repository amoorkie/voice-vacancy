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
