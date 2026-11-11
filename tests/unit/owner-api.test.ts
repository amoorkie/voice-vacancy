// Проверки границы провайдера не используют настоящий ключ и не расходуют баланс.
import { afterEach, expect, test, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createApp } from "../../src/server/app";
import {
  parseDraft,
  parseEvaluation,
  draftRequest,
  type EvaluationInput,
} from "../../src/contracts/owner-api";
import { sectionIds } from "../../src/contracts/interview";

const cleanups: (() => Promise<unknown> | void)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
});
/** Формирует вымышленные сведения с новыми идентификаторами каждой попытки. */
function input(): EvaluationInput {
  return {
    requestId: randomUUID(),
    sessionId: randomUUID(),
    questionId: "Q1",
    revision: 1,
    text: "Разбирает заявки и обновляет инструкции, чтобы клиенты быстрее получали ответы.",
    followUpUsed: false,
    rubricVersion: "rubric-v1",
  };
}
/** Возвращает допустимую структурную оценку без смыслового вызова модели. */
function evaluation(text: string) {
  return {
    kind: "ai",
    items: [1, 2].map((i) => ({
      slotId: `Q1.${i}`,
      status: "present",
      evidence: [text],
      reason: "Есть сведения",
    })),
    conflicts: [],
  };
}
/** Создаёт одноразовый локальный сервер с контролируемым транспортом. */
async function setup(fetcher: typeof fetch, extra = {}) {
  const app = createApp(false, {
    provider: {
      key: "unit-test-secret",
      model: "test-model",
      baseUrl: "https://api.wikivibe.dev/v1",
      fetcher,
    },
    ...extra,
  });
  cleanups.push(() => app.close());
  const config = (await app.inject({ url: "/api/config" })).json();
  const headers = {
    origin: "http://127.0.0.1:4317",
    "x-demo-token": config.csrfToken,
  };
  return { app, config, headers };
}

test("проверенный результат возвращается только с ID приложения; ключ не выдаётся браузеру", async () => {
  const value = input();
  const fetcher = vi.fn(async (_url, options) => {
    const body = JSON.parse(options!.body as string);
    expect(body.model).toBe("test-model");
    expect(body.store).toBe(false);
    expect(body.messages[1].content).not.toContain(value.sessionId);
    return Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: { content: JSON.stringify(evaluation(value.text)) },
        },
      ],
    });
  }) as typeof fetch;
  const { app, headers, config } = await setup(fetcher);
  expect(JSON.stringify(config)).not.toContain("unit-test-secret");
  const response = await app.inject({
    method: "POST",
    url: "/api/completeness",
    headers,
    payload: value,
  });
  expect(response.statusCode).toBe(200);
  expect(response.json().requestId).toBe(value.requestId);
  expect(response.json().value.kind).toBe("ai");
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("чужой origin, host, token и неверный вход не вызывают модель", async () => {
  const fetcher = vi.fn() as typeof fetch;
  const { app, headers } = await setup(fetcher);
  for (const bad of [
    { ...headers, origin: "https://evil.example" },
    { ...headers, host: "evil.example" },
    { ...headers, "x-demo-token": "bad" },
  ]) {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/completeness",
          headers: bad,
          payload: input(),
        })
      ).statusCode,
    ).toBe(403);
  }
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/completeness",
        headers,
        payload: { ...input(), text: "x".repeat(6001) },
      })
    ).statusCode,
  ).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
});

test("ошибка баланса не раскрывает тело провайдера и не подменяется примером", async () => {
  const { app, headers } = await setup(
    vi.fn(async () =>
      Response.json(
        { code: "INSUFFICIENT_BALANCE", message: "private upstream details" },
        { status: 403 },
      ),
    ) as typeof fetch,
  );
  const response = await app.inject({
    method: "POST",
    url: "/api/completeness",
    headers,
    payload: input(),
  });
  expect(response.statusCode).toBe(503);
  expect(response.json().code).toBe("provider-balance");
  expect(response.body).not.toContain("private upstream");
  expect(response.json().value).toBeUndefined();
});

test("повтор запроса отклоняется, новая попытка не ограничена накопительной квотой", async () => {
  const fetcher = vi.fn(async () =>
    Response.json({ error: {} }, { status: 500 }),
  ) as typeof fetch;
  const { app, headers } = await setup(fetcher);
  const payload = input();
  await app.inject({
    method: "POST",
    url: "/api/completeness",
    headers,
    payload,
  });
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/completeness",
        headers,
        payload,
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/completeness",
        headers,
        payload: input(),
      })
    ).statusCode,
  ).toBe(503);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test("тайм-аут прекращает транспорт без автоматического повтора", async () => {
  const fetcher = vi.fn(
    (_url, options) =>
      new Promise<Response>((_resolve, reject) =>
        options!.signal!.addEventListener("abort", () =>
          reject(new Error("aborted")),
        ),
      ),
  ) as typeof fetch;
  const { app, headers } = await setup(fetcher, { deadlineMs: 15 });
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/completeness",
        headers,
        payload: input(),
      })
    ).statusCode,
  ).toBe(504);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test.each(["length", "stop"])(
  "неполный/пустой ответ с finish_reason=%s отклоняется",
  async (finish) => {
    const { app, headers } = await setup(
      vi.fn(async () =>
        Response.json({
          choices: [
            {
              finish_reason: finish,
              message: { content: finish === "stop" ? "   " : "{}" },
            },
          ],
        }),
      ) as typeof fetch,
    );
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/completeness",
          headers,
          payload: input(),
        })
      ).statusCode,
    ).toBe(502);
  },
);

test("более 20 вызовов доступны, а минутная частота по-прежнему ограничена", async () => {
  const fetcher = vi.fn(async () =>
    Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: { content: JSON.stringify(evaluation(input().text)) },
        },
      ],
    }),
  ) as typeof fetch;
  const { app, headers } = await setup(fetcher);
  let now = Date.now();
  const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
  try {
    for (let i = 0; i < 25; i++) {
      now += 11000;
      const response = await app.inject({
        method: "POST",
        url: "/api/completeness",
        headers,
        payload: input(),
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().code).not.toBe("budget-exhausted");
    }
    expect(fetcher).toHaveBeenCalledTimes(25);
    now += 61000;
    for (let i = 0; i < 6; i++)
      await app.inject({
        method: "POST",
        url: "/api/completeness",
        headers,
        payload: input(),
      });
    const limited = await app.inject({
      method: "POST",
      url: "/api/completeness",
      headers,
      payload: input(),
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().code).toBe("rate-limited");
    expect(fetcher).toHaveBeenCalledTimes(31);
  } finally {
    clock.mockRestore();
  }
});

test("чужая цитата, второй вопрос и ложный конфликт проверяются независимо от модели", () => {
  const request = input();
  expect(() => parseEvaluation(evaluation("чужая цитата"), request)).toThrow();
  expect(
    parseEvaluation(
      { ...evaluation(request.text), followUp: "Ещё?" },
      { ...request, followUpUsed: true },
    ).followUp,
  ).toBeUndefined();
  expect(() =>
    parseEvaluation(
      {
        ...evaluation(request.text),
        conflicts: [
          { slotIds: ["Q1.1"], evidence: [request.text, request.text] },
        ],
      },
      request,
    ),
  ).toThrow();
});

test("черновик проверяет все шесть разделов, цитаты, версии и отдельные утверждения", () => {
  const request = draftRequest.parse({
    requestId: randomUUID(),
    sessionId: randomUUID(),
    snapshotId: "snapshot",
    draftEditRevision: 0,
    answers: ["Q1", "Q2", "Q3", "Q4"].map((questionId) => ({
      questionId,
      confirmedRevision: 1,
      text: "Разбирает заявки",
    })),
  });
  const draft = {
    kind: "draft",
    sections: sectionIds.map((id) => ({
      id,
      items: [
        {
          id,
          kind: "fact",
          text: "Разбирает заявки",
          sourceRefs: [
            {
              questionId: "Q1",
              confirmedRevision: 1,
              quote: "Разбирает заявки",
            },
          ],
        },
      ],
    })),
  };
  expect(parseDraft(draft, request)).toMatchObject({
    origin: "ai",
    sections: { tasks: "Разбирает заявки" },
  });
  const wrong = structuredClone(draft);
  wrong.sections[0].items[0].sourceRefs[0].confirmedRevision = 2;
  expect(() => parseDraft(wrong, request)).toThrow("Чужой источник");
  wrong.sections[0].items[0].sourceRefs[0].confirmedRevision = 1;
  wrong.sections[0].items[0].sourceRefs = [];
  expect(() => parseDraft(wrong, request)).toThrow("Факт без основания");
  expect(() =>
    parseDraft({ ...draft, sections: draft.sections.slice(1) }, request),
  ).toThrow();
});

test("четыре предельных ответа проходят вход без усечения", () => {
  const request = {
    requestId: randomUUID(),
    sessionId: randomUUID(),
    snapshotId: "snapshot",
    draftEditRevision: 0,
    answers: ["Q1", "Q2", "Q3", "Q4"].map((questionId) => ({
      questionId,
      confirmedRevision: 1,
      text: "Я".repeat(6000),
    })),
  };
  expect(draftRequest.parse(request).answers[3].text.length).toBe(6000);
});
