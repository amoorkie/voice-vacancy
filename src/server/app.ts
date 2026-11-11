// Сервер каркаса раздаёт интерфейс и явно запрещает любую внешнюю обработку.
import Fastify from "fastify";
import staticPlugin from "@fastify/static";
import { resolve } from "node:path";

/** Создаёт сервер без слушающего сокета, чтобы тестировать запреты через inject. */
export function createApp(serveStatic = true) {
  const app = Fastify({ logger: false, bodyLimit: 163840 });
  app.addHook("onRequest", async (request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Permissions-Policy", "microphone=(), camera=()");
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    );
    if (request.url.split("?")[0].startsWith("/api/")) {
      return reply
        .code(503)
        .send({
          code: "integration-disabled",
          message: "Внешний API пока не подключён.",
        });
    }
  });
  app.get("/health", async () => ({
    status: "ok",
    mode: "fixtures",
    externalApi: false,
  }));
  if (serveStatic) app.register(staticPlugin, { root: resolve("dist/client") });
  return app;
}
