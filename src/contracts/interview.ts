// Общие типы и проверки тестового адаптера; контракт API владельца будет отдельным.
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
    kind: z.literal("fixture"),
    items: z.array(
      z
        .object({
          slotId: z.string(),
          status: z.enum(["present", "missing", "explicitly_unknown"]),
          evidence: z.array(z.string().min(1)),
        })
        .strict(),
    ),
    followUp: z.string().optional(),
  })
  .strict();
export type Evaluation = z.infer<typeof evaluationSchema>;
export type Draft = {
  sections: Record<SectionId, string>;
  sources: Partial<Record<SectionId, TopicId[]>>;
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
  }
  return value;
}
