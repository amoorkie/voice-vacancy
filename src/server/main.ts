// Точка запуска локального сервера; публичное размещение требует отдельного решения.
import { createApp } from "./app.js";
const app = createApp();
try {
  if (
    process.env.HOST &&
    !["127.0.0.1", "localhost", "::1"].includes(process.env.HOST)
  )
    throw new Error("Разрешён только локальный запуск");
  await app.listen({
    host: process.env.HOST ?? "127.0.0.1",
    port: Number(process.env.PORT ?? 4317),
  });
} catch {
  process.stderr.write(
    "Не удалось запустить Voice Vacancy. Проверьте порт и сборку.\n",
  );
  process.exitCode = 1;
}
// Закрываем слушатель при остановке процесса, не оставляя фоновых операций.
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void app.close();
  });
