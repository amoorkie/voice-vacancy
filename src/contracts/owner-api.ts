// Контракт локального сервера: входы и источники проверяются независимо от ответа модели.
import { z } from "zod";
import {
  MAX_TEXT,
  sectionIds,
  topicIds,
  textLength,
  validateEvaluation,
  type Draft,
} from "./interview.js";

const text = z
  .string()
  .refine((v) => v.trim().length > 0 && textLength(v) <= MAX_TEXT);
const envelope = { requestId: z.uuid(), sessionId: z.uuid() };
export const evaluationRequest = z
  .object({
    ...envelope,
    questionId: z.enum(topicIds),
    revision: z.int().nonnegative(),
    text,
    followUpUsed: z.boolean(),
    rubricVersion: z.literal("rubric-v1"),
  })
  .strict();
export const sourceAnswer = z
  .object({
    questionId: z.enum(topicIds),
    confirmedRevision: z.int().positive(),
    text,
  })
  .strict();
export const draftRequest = z
  .object({
    ...envelope,
    snapshotId: z.string().min(1).max(150000),
    draftEditRevision: z.int().nonnegative(),
    answers: z.array(sourceAnswer).length(4),
  })
  .strict()
  .refine((v) => v.answers.every((a, i) => a.questionId === topicIds[i]));
export type EvaluationInput = z.infer<typeof evaluationRequest>;
export type DraftInput = z.infer<typeof draftRequest>;

const sourceRef = z
  .object({
    questionId: z.enum(topicIds),
    confirmedRevision: z.int().positive(),
    quote: z.string().min(1).max(24000),
  })
  .strict();
const claim = z
  .object({
    id: z.string().min(1).max(100),
    kind: z.enum(["fact", "unknown", "conflict"]),
    text: z.string().min(1).max(24000),
    sourceRefs: z.array(sourceRef).max(20),
    reason: z.literal("not-mentioned").optional(),
  })
  .strict();
const modelDraft = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("insufficient-input"),
      reason: z.string().min(1).max(1000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("draft"),
      sections: z
        .array(
          z
            .object({
              id: z.enum(sectionIds),
              items: z.array(claim).min(1).max(40),
            })
            .strict(),
        )
        .length(6),
    })
    .strict(),
]);

/** Проверяет рубрику и исключает второе уточнение даже при ошибке модели. */
export function parseEvaluation(raw: unknown, input: EvaluationInput) {
  const result = validateEvaluation(raw, input.questionId, input.text);
  if (
    result.kind !== "ai" ||
    !result.conflicts ||
    result.items.some((i) => !i.reason?.trim()) ||
    textLength(JSON.stringify(result)) > 12000
  )
    throw new Error("Некорректная оценка");
  if (
    result.followUp &&
    (!result.followUp.trim() || result.followUp.length > 600)
  )
    throw new Error("Некорректное уточнение");
  if (input.followUpUsed || result.items.every((i) => i.status === "present"))
    delete result.followUp;
  return result;
}

/** Принимает только полный черновик с точными ссылками на подтверждённый снимок. */
export function parseDraft(
  raw: unknown,
  input: DraftInput,
): Draft | "insufficient" {
  const value = modelDraft.parse(raw);
  if (value.kind === "insufficient-input") return "insufficient";
  if (
    new Set(value.sections.map((s) => s.id)).size !== 6 ||
    textLength(JSON.stringify(value)) > 12000
  )
    throw new Error("Неполный или слишком длинный черновик");
  const ids = new Set<string>();
  const sections = {} as Draft["sections"];
  const sources: Draft["sources"] = {};
  const claims: Draft["claims"] = {};
  for (const section of value.sections) {
    for (const item of section.items) {
      if (ids.has(item.id)) throw new Error("Повтор утверждения");
      ids.add(item.id);
      if (item.kind === "fact" && (!item.sourceRefs.length || item.reason))
        throw new Error("Факт без основания");
      if (
        item.kind === "unknown" &&
        !item.sourceRefs.length &&
        item.reason !== "not-mentioned"
      )
        throw new Error("Неизвестное без основания");
      if (
        item.kind === "conflict" &&
        (new Set(item.sourceRefs.map((r) => r.quote)).size < 2 || item.reason)
      )
        throw new Error("Конфликт без двух свидетельств");
      for (const ref of item.sourceRefs) {
        const answer = input.answers.find(
          (a) => a.questionId === ref.questionId,
        );
        if (
          !answer ||
          answer.confirmedRevision !== ref.confirmedRevision ||
          !answer.text.includes(ref.quote)
        )
          throw new Error("Чужой источник");
      }
    }
    sections[section.id] = section.items.map((i) => i.text).join("\n");
    sources[section.id] = [
      ...new Set(
        section.items.flatMap((i) => i.sourceRefs.map((r) => r.questionId)),
      ),
    ];
    claims[section.id] = section.items;
  }
  return { sections, sources, claims, origin: "ai" };
}
