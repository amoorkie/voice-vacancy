// Постоянный консервативный счётчик попыток для одного локального процесса.
import {
  mkdirSync,
  openSync,
  writeFileSync,
  fsyncSync,
  closeSync,
  readFileSync,
  existsSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
const ledgerSchema = z
  .object({ version: z.literal(1), ids: z.array(z.string()).max(10000) })
  .strict();

/** Сначала сохраняет резерв на диске, затем разрешает вызов; ошибки не возвращают резерв. */
export class CallBudget {
  private lock?: number;
  private failed = false;
  private ids: string[] = [];
  constructor(
    private path: string,
    private limit: number,
  ) {
    try {
      mkdirSync(dirname(path), { recursive: true });
      this.lock = openSync(`${path}.lock`, "wx");
      if (existsSync(path))
        this.ids = ledgerSchema.parse(
          JSON.parse(readFileSync(path, "utf8")),
        ).ids;
      if (!Number.isInteger(limit) || limit < 1 || limit > 10000)
        this.failed = true;
    } catch {
      this.failed = true;
    }
  }
  /** Резерв и проверка выполняются синхронно: два запроса не получают последний слот. */
  reserve(id: string) {
    if (this.failed) throw new Error("budget-unavailable");
    if (this.ids.includes(id)) throw new Error("duplicate-request");
    if (this.ids.length >= this.limit) throw new Error("budget-exhausted");
    try {
      const next = [...this.ids, id];
      const fd = openSync(`${this.path}.tmp`, "w");
      try {
        writeFileSync(fd, JSON.stringify({ version: 1, ids: next }));
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(`${this.path}.tmp`, this.path);
      this.ids = next;
    } catch {
      this.failed = true;
      throw new Error("budget-unavailable");
    }
  }
  /** Закрывает только собственную блокировку; после аварии требуется ручная проверка журнала. */
  close() {
    if (this.lock !== undefined) {
      closeSync(this.lock);
      unlinkSync(`${this.path}.lock`);
      this.lock = undefined;
    }
  }
}
