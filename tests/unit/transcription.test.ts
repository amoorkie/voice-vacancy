// Запись не превращается в ответ при тишине, неверном формате или отказе распознавания.
import { expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { createApp } from "../../src/server/app";
import { validateWave } from "../../src/server/transcription";
import { encodeWave } from "../../src/client/interview/microphone";

/** Генерирует короткую неперсональную запись для проверки транспорта. */
function sample(silent = false) {
  const pcm = Float32Array.from({ length: 16000 }, (_, i) =>
    silent ? 0 : Math.sin(i / 10) * 0.1,
  );
  return Buffer.from(encodeWave(pcm));
}

test("WAV ограничен PCM16 mono, тишина отклоняется", () => {
  expect(() => validateWave(sample())).not.toThrow();
  expect(() => validateWave(sample(true))).toThrow(/Речь не обнаружена/);
  expect(() => validateWave(Buffer.alloc(100))).toThrow(/WAV/);
  const broken = sample();
  broken.writeUInt32LE(44100, 24);
  expect(() => validateWave(broken)).toThrow(/WAV/);
});

test("сервер распознаёт одну запись и не вызывает распознаватель при тишине или чужом Origin", async () => {
  let calls = 0;
  const app = createApp(false, {
    transcriber: async () => {
      calls++;
      return "Писать тесты и исправлять ошибки.";
    },
  });
  try {
    const config = (await app.inject({ url: "/api/config" })).json();
    const headers = {
      origin: "http://127.0.0.1:4317",
      "x-demo-token": config.csrfToken,
    };
    const input = (silent: boolean) => ({
      requestId: randomUUID(),
      sessionId: randomUUID(),
      questionId: "Q1",
      revision: 0,
      audio: sample(silent).toString("base64"),
    });
    expect(config.voice).toBe("microphone");
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/transcriptions",
          headers,
          payload: input(true),
        })
      ).statusCode,
    ).toBe(422);
    expect(calls).toBe(0);
    const payload = input(false);
    const response = await app.inject({
      method: "POST",
      url: "/api/transcriptions",
      headers,
      payload,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      requestId: payload.requestId,
      sessionId: payload.sessionId,
      text: "Писать тесты и исправлять ошибки.",
    });
    const denied = await app.inject({
      method: "POST",
      url: "/api/transcriptions",
      headers: { ...headers, origin: "https://other.example" },
      payload: input(false),
    });
    expect(denied.statusCode).toBe(403);
    expect(calls).toBe(1);
  } finally {
    await app.close();
  }
});

test("пустой результат распознавания возвращает ошибку", async () => {
  const app = createApp(false, { transcriber: async () => "" });
  try {
    const config = (await app.inject({ url: "/api/config" })).json();
    const response = await app.inject({
      method: "POST",
      url: "/api/transcriptions",
      headers: {
        origin: "http://127.0.0.1:4317",
        "x-demo-token": config.csrfToken,
      },
      payload: {
        requestId: randomUUID(),
        sessionId: randomUUID(),
        questionId: "Q1",
        revision: 0,
        audio: sample().toString("base64"),
      },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().message).toContain("Речь не обнаружена");
  } finally {
    await app.close();
  }
});
