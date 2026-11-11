// Локальный сервер хранит ключ и проверяет вход и ответ модели до передачи браузеру.
import Fastify from "fastify";
import staticPlugin from "@fastify/static";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import {
  evaluationRequest,
  draftRequest,
  parseEvaluation,
  parseDraft,
} from "../contracts/owner-api.js";
import { evaluationPrompt, draftPrompt } from "./prompts.js";
import { ApiError, completeJson, type ProviderConfig } from "./provider.js";
import {
  speechAvailable,
  registerTranscription,
  type Transcriber,
} from "./transcription.js";
export type AppOptions = {
  transcriber?: Transcriber;
  provider?: ProviderConfig;
  deadlineMs?: number;
};

/** Создаёт сервер без слушающего сокета, чтобы тестировать запреты через inject. */
export function createApp(serveStatic = true, options: AppOptions = {}) {
  const enabled = process.env.AI_ENABLED === "true";
  const key = process.env.WIKIVIBE_API_KEY;
  const model = process.env.WIKIVIBE_MODEL;
  const baseUrl =
    process.env.WIKIVIBE_API_BASE ?? "https://api.wikivibe.dev/v1";
  const provider =
    options.provider ??
    (enabled && key && model && baseUrl === "https://api.wikivibe.dev/v1"
      ? { key, model, baseUrl }
      : undefined);
  const mode = provider ? "api" : enabled ? "unavailable" : "fixtures";
  const token = randomBytes(32).toString("hex");
  const app = Fastify({ logger: false, bodyLimit: 500000 });
  const port = process.env.PORT ?? "4317";
  const hosts = new Set([
    `127.0.0.1:${port}`,
    `localhost:${port}`,
    "127.0.0.1:4316",
    "localhost:4316",
    "localhost:80",
    "localhost",
  ]);
  const origins = new Set([
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    "http://127.0.0.1:4316",
    "http://localhost:4316",
  ]);
  // Публичный origin задаётся владельцем в env. Адрес запроса не расширяет разрешённый список.
  if (process.env.PUBLIC_ORIGIN) {
    const publicUrl = new URL(process.env.PUBLIC_ORIGIN);
    if (
      publicUrl.protocol !== "https:" ||
      publicUrl.origin !== process.env.PUBLIC_ORIGIN
    )
      throw new Error("PUBLIC_ORIGIN должен содержать только HTTPS origin");
    hosts.add(publicUrl.host);
    origins.add(publicUrl.origin);
  }
  let active = false;
  // Минутное окно защищает от повторов и случайных частых кликов, общей квоты генераций нет.
  let recent: { id: string; at: number }[] = [];
  app.addHook("onRequest", async (request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Cache-Control", "no-store");
    reply.header(
      "Permissions-Policy",
      (speechAvailable() || options.transcriber
        ? "microphone=(self)"
        : "microphone=()") + ", camera=()",
    );
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    );
    if (
      !hosts.has(request.headers.host ?? "") ||
      (request.headers.origin && !origins.has(request.headers.origin))
    )
      return reply.code(403).send({
        code: "origin-denied",
        message: "Недопустимый адрес запроса.",
      });
  });
  app.get("/health", async () => ({
    status: "ok",
    mode,
    externalApi: !!provider,
  }));
  app.get("/api/config", async () => ({
    mode,
    csrfToken: token,
    model: provider?.model ?? null,
    voice:
      speechAvailable() || options.transcriber
        ? "microphone"
        : mode === "fixtures"
          ? "fixtures"
          : "unavailable",
  }));
  registerTranscription(app, token, options.transcriber);
  app.post<{ Params: { operation: string } }>(
    "/api/:operation",
    async (request, reply) => {
      const operation = request.params.operation;
      if (!provider || !["completeness", "vacancy"].includes(operation))
        return reply.code(503).send({
          code: "integration-disabled",
          message: "Эта обработка пока не подключена. Ваш текст сохранён.",
        });
      if (!request.headers.origin || request.headers["x-demo-token"] !== token)
        return reply.code(403).send({
          code: "origin-denied",
          message: "Обновите страницу перед запросом.",
        });
      const isEvaluation = operation === "completeness";
      const parsed = isEvaluation
        ? evaluationRequest.safeParse(request.body)
        : draftRequest.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({
          code: "invalid-input",
          message: "Проверьте длину и подтверждение ответов.",
        });
      const input = parsed.data;
      recent = recent.filter((attempt) => Date.now() - attempt.at < 60000);
      if (recent.some((attempt) => attempt.id === input.requestId))
        return reply.code(409).send({
          code: "duplicate-request",
          message: "Эта попытка уже была отправлена.",
        });
      if (active || recent.length >= 6)
        return reply.code(429).send({
          code: "rate-limited",
          message: "Подождите завершения запроса или повторите через минуту.",
        });
      active = true;
      recent.push({ id: input.requestId, at: Date.now() });
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        options.deadlineMs ?? (isEvaluation ? 20000 : 60000),
      );
      const disconnect = () => {
        if (!reply.raw.writableEnded) controller.abort();
      };
      request.raw.once("aborted", disconnect);
      reply.raw.once("close", disconnect);
      try {
        // Модель не выбирает служебные ID; отправляем только сведения, нужные для задачи.
        const modelInput =
          "text" in input
            ? {
                questionId: input.questionId,
                text: input.text,
                followUpUsed: input.followUpUsed,
              }
            : { answers: input.answers };
        const raw = await completeJson(
          provider,
          isEvaluation ? evaluationPrompt : draftPrompt,
          modelInput,
          isEvaluation ? 4096 : 8192,
          controller.signal,
        );
        const value =
          "text" in input
            ? parseEvaluation(raw, input)
            : parseDraft(raw, input);
        return {
          requestId: input.requestId,
          sessionId: input.sessionId,
          value,
        };
      } catch (error) {
        if (controller.signal.aborted)
          return reply.code(504).send({
            code: "timeout",
            message:
              "Ожидание завершено. Ваш текст сохранён; можно повторить вручную.",
          });
        if (error instanceof ApiError)
          return reply
            .code(error.status)
            .send({ code: error.code, message: error.message });
        return reply.code(502).send({
          code: "invalid-provider-output",
          message: "Не удалось проверить ответ сервиса. Ваш текст сохранён.",
        });
      } finally {
        clearTimeout(timer);
        request.raw.off("aborted", disconnect);
        reply.raw.off("close", disconnect);
        active = false;
      }
    },
  );
  if (serveStatic) app.register(staticPlugin, { root: resolve("dist/client") });
  return app;
}
