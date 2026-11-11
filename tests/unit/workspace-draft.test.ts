// Тестовые ответы и черновик «Искры» остаются согласованными с формулировками руководителя.
import { expect, test } from "vitest";
import {
  fixtureDraft,
  fixtureEvaluation,
  workspaceSamples,
  unknownAnswer,
  conflictingSkills,
} from "../../src/domain/fixtures";
import { validateEvaluation } from "../../src/contracts/interview";

test("противоречие в требованиях сохраняет обе цитаты и становится вопросом", () => {
  const evaluation = validateEvaluation(
    fixtureEvaluation("Q4", conflictingSkills),
    "Q4",
    conflictingSkills,
  );
  expect(evaluation.conflicts?.[0].evidence).toHaveLength(2);
  const draft = fixtureDraft([
    ...workspaceSamples.slice(0, 3),
    conflictingSkills,
  ]);
  if (!draft || draft === "insufficient") throw new Error("Ожидался черновик");
  expect(draft.sections.skills).toContain("расходятся");
  expect(draft.sections.clarifications).toContain("обязателен ли Playwright");
  expect(draft.sources.clarifications).toContain("Q4");
});
test("известного проекта хватает для черновика, даже если роль не названа", () => {
  const draft = fixtureDraft([unknownAnswer, ...workspaceSamples.slice(1)]);
  if (!draft || draft === "insufficient") throw new Error("Ожидался черновик");
  expect(draft.sections.role).not.toContain("Frontend");
  expect(draft.sections["first-half"]).toBe(workspaceSamples[1]);
  expect(
    fixtureDraft([unknownAnswer, unknownAnswer, ...workspaceSamples.slice(2)]),
  ).toBe("insufficient");
  expect(
    fixtureDraft(["Текст вне примеров", ...workspaceSamples.slice(1)]),
  ).toBeNull();
});
