// Проверка аудио и локальное распознавание не обращаются к внешнему текстовому API.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { MAX_TEXT, textLength } from "../contracts/interview.js";

const audioRequest = z
  .object({
    requestId: z.uuid(),
    sessionId: z.uuid(),
    questionId: z.enum(["Q1", "Q2", "Q3", "Q4"]),
    revision: z.int().nonnegative(),
    audio: z
      .string()
      .min(100)
      .max(5_130_000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();

export type Transcriber = (
  wave: Buffer,
  signal: AbortSignal,
) => Promise<string>;

/** Включает реальный микрофон только при установленном распознавателе и модели. */
export function speechAvailable() {
  return (
    process.env.ASR_ENABLED === "true" &&
    existsSync(process.env.ASR_PYTHON ?? "") &&
    existsSync(process.env.ASR_MODEL_PATH ?? "")
  );
}

/** Проверяет простой PCM16 WAV и наличие звука до запуска модели. */
export function validateWave(wave: Buffer) {
  if (
    wave.length < 9644 ||
    wave.length > 3_840_044 ||
    wave.toString("ascii", 0, 4) !== "RIFF" ||
    wave.toString("ascii", 8, 12) !== "WAVE" ||
    wave.toString("ascii", 12, 16) !== "fmt " ||
    wave.readUInt32LE(16) !== 16 ||
    wave.readUInt16LE(20) !== 1 ||
    wave.readUInt16LE(22) !== 1 ||
    wave.readUInt32LE(24) !== 16000 ||
    wave.readUInt32LE(4) !== wave.length - 8 ||
    wave.readUInt32LE(28) !== 32000 ||
    wave.readUInt16LE(32) !== 2 ||
    wave.readUInt16LE(34) !== 16 ||
    wave.toString("ascii", 36, 40) !== "data" ||
    wave.readUInt32LE(40) !== wave.length - 44 ||
    (wave.length - 44) % 2
  )
    throw new Error("Передайте запись WAV PCM16 mono, до двух минут.");
  let energy = 0;
  for (let i = 44; i < wave.length; i += 2)
    energy += (wave.readInt16LE(i) / 32768) ** 2;
  if (Math.sqrt(energy / ((wave.length - 44) / 2)) < 0.001)
    throw new Error("Речь не обнаружена. Повторите запись или напишите ответ.");
}

/** Передаёт звук Python через stdin. Отмена завершает дочерний процесс, исходные данные не пишутся на диск. */
function recognize(wave: Buffer, signal: AbortSignal): Promise<string> {
  return new Promise((accept, reject) => {
    const child = execFile(
      process.env.ASR_PYTHON!,
      [resolve("deploy/portfolio/transcribe.py"), process.env.ASR_MODEL_PATH!],
      { encoding: "utf8", signal, timeout: 45000, maxBuffer: 64000 },
      (error, stdout) => {
        if (error) {
          reject(
            new Error(
              "Не удалось распознать речь. Попробуйте ещё раз или напишите ответ.",
            ),
          );
          return;
        }
        try {
          const value = JSON.parse(stdout);
          if (
            typeof value.text !== "string" ||
            textLength(value.text) > MAX_TEXT
          )
            throw new Error();
          accept(value.text.trim());
        } catch {
          reject(
            new Error(
              "Распознавание вернуло неверный ответ. Повторите запись.",
            ),
          );
        }
      },
    );
    child.stdin?.on("error", () => {});
    child.stdin?.end(wave);
  });
}

/** Ограничивает очередь распознавания и сохраняет текст клиента при любой ошибке. */
export function registerTranscription(
  app: FastifyInstance,
  token: string,
  transcribe?: Transcriber,
) {
  let active = false;
  let recent: number[] = [];
  app.post(
    "/api/transcriptions",
    { bodyLimit: 5_200_000 },
    async (request, reply) => {
      if (!transcribe && !speechAvailable())
        return reply.code(503).send({
          code: "integration-disabled",
          message: "Распознавание сейчас недоступно. Напишите ответ текстом.",
        });
      if (!request.headers.origin || request.headers["x-demo-token"] !== token)
        return reply
          .code(403)
          .send({ message: "Обновите страницу и повторите запись." });
      const parsed = audioRequest.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({ message: "Некорректная запись." });
      const wave = Buffer.from(parsed.data.audio, "base64");
      try {
        validateWave(wave);
      } catch (error) {
        return reply.code(422).send({ message: (error as Error).message });
      }
      recent = recent.filter((time) => Date.now() - time < 60000);
      if (active || recent.length >= 6)
        return reply.code(429).send({
          message:
            "Распознавание занято. Повторите через минуту или напишите ответ.",
        });
      active = true;
      recent.push(Date.now());
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45000);
      const disconnect = () => {
        if (!reply.raw.writableFinished) controller.abort();
      };
      request.raw.once("aborted", disconnect);
      reply.raw.once("close", disconnect);
      try {
        const text = await (transcribe ?? recognize)(wave, controller.signal);
        if (!text.trim())
          return reply.code(422).send({
            message: "Речь не обнаружена. Повторите запись или напишите ответ.",
          });
        return {
          requestId: parsed.data.requestId,
          sessionId: parsed.data.sessionId,
          text,
        };
      } catch {
        return reply.code(controller.signal.aborted ? 504 : 502).send({
          message:
            "Не удалось распознать речь. Повторите запись или напишите ответ.",
        });
      } finally {
        clearTimeout(timer);
        request.raw.off("aborted", disconnect);
        reply.raw.off("close", disconnect);
        active = false;
        wave.fill(0);
      }
    },
  );
}
