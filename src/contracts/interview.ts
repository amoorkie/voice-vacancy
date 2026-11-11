// Общие типы и проверки; секреты и транспорт провайдера остаются на сервере.
import { z } from "zod";
export const MAX_TEXT = 6000;
export const topicIds = ["Q1", "Q2", "Q3", "Q4"] as const;
export type TopicId = (typeof topicIds)[number];
export const sectionIds = [
  "role",
  "tasks",
  "first-half",
  "next-half",
  "skills",
  "clarifications",
] as const;
export type SectionId = (typeof sectionIds)[number];
export const sectionNames: Record<SectionId, string> = {
  role: "Роль и известные условия",
  tasks: "Ежедневные задачи",
  "first-half": "Первые шесть месяцев",
  "next-half": "Следующее полугодие",
  skills: "Инструменты и знания",
  clarifications: "Что нужно уточнить",
};
export const topicSchema = z.enum(topicIds);
export const evaluationSchema = z
  .object({
    kind: z.enum(["fixture", "ai"]),
    items: z.array(
      z
        .object({
          slotId: z.string(),
          status: z.enum(["present", "missing", "explicitly_unknown"]),
          evidence: z.array(z.string().min(1)),
          reason: z.string().max(1000).optional(),
        })
        .strict(),
    ),
    followUp: z.string().optional(),
    conflicts: z
      .array(
        z
          .object({
            slotIds: z.array(z.string()).min(1),
            evidence: z.array(z.string().min(1)).min(2),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();
export type Evaluation = z.infer<typeof evaluationSchema>;
export type Draft = {
  sections: Record<SectionId, string>;
  sources: Partial<Record<SectionId, TopicId[]>>;
  origin?: "ai";
  claims?: Partial<
    Record<
      SectionId,
      {
        id: string;
        kind: "fact" | "unknown" | "conflict";
        text: string;
        sourceRefs: {
          questionId: TopicId;
          confirmedRevision: number;
          quote: string;
        }[];
        reason?: "not-mentioned";
      }[]
    >
  >;
};
export type Outcome = "success" | "error" | "timeout";
export type OperationKind = "transcription" | "evaluation" | "generation";

/** Считает символы Unicode, сохраняя исходный текст при превышении предела. */
export function textLength(text: string) {
  return [...text].length;
}
/** Проверяет только заполненность; неизвестность не превращает в известный факт. */
export function validText(text: string) {
  return text.trim().length > 0 && textLength(text) <= MAX_TEXT;
}
/** Проверяет полноту ID и точные цитаты до применения тестовой оценки. */
export function validateEvaluation(
  raw: unknown,
  question: TopicId,
  text: string,
): Evaluation {
  const value = evaluationSchema.parse(raw);
  const count = question === "Q4" ? 3 : 2;
  const ids = new Set(value.items.map((item) => item.slotId));
  if (value.items.length !== count || ids.size !== count)
    throw new Error("Неверный состав оценки");
  for (let i = 1; i <= count; i++)
    if (!ids.has(`${question}.${i}`)) throw new Error("Неизвестный пункт");
  for (const item of value.items) {
    if (item.status !== "missing" && !item.evidence.length)
      throw new Error("Нет источника");
    if (item.evidence.some((quote) => !text.includes(quote)))
      throw new Error("Чужая цитата");
    if (item.status === "missing" && item.evidence.length)
      throw new Error("Цитаты конфликта должны быть выделены отдельно");
  }
  for (const conflict of value.conflicts ?? []) {
    if (
      new Set(conflict.evidence).size < 2 ||
      conflict.evidence.some((quote) => !text.includes(quote)) ||
      conflict.slotIds.some(
        (id) =>
          !value.items.some(
            (item) => item.slotId === id && item.status === "missing",
          ),
      )
    )
      throw new Error("Неверное основание конфликта");
  }
  return value;
}
