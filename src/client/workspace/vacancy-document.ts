// Строит один документ для чтения, копирования и файла из текущей редакции шести разделов.
import {
  sectionIds,
  sectionNames,
  type SectionId,
} from "../../contracts/interview";
import { resultStale, type Result, type Session } from "../../domain/session";

/** Разбирает шесть разделов для прямого ввода. Пустая первая строка оставляет название незаполненным. */
export function vacancyDocument(result: Result) {
  const current = (id: SectionId) =>
    result.edits[id] ?? result.generated.sections[id];
  const role = current("role").split(/\r?\n/);
  const firstClaim = result.generated.claims?.role?.[0];
  const named =
    result.edits.role !== undefined ||
    (result.generated.origin === "ai"
      ? firstClaim?.id === "role-title" && firstClaim.kind === "fact"
      : !!result.generated.sources.role?.length);
  const title = named ? (role.shift() ?? "") : "";
  const conditions = role.join("\n");
  const sections = sectionIds
    .filter((id) => id !== "role")
    .map((id) => {
      const list = id === "tasks" || id === "skills" || id === "clarifications";
      let body = current(id);
      if (list && result.edits[id] === undefined)
        body = body.replace(/^[•*-][ \t]+/gm, "");
      return { id, title: sectionNames[id], list, body };
    });
  return { title, conditions, sections };
}

/** Выгружает ту же редакцию и маркирует устаревшие источники и ручные изменения. */
export function vacancyDocumentText(state: Session) {
  if (!state.result) return "";
  const doc = vacancyDocument(state.result);
  const blocks = [doc.title.trim() || "Вакансия", doc.conditions.trim()].filter(
    Boolean,
  );
  for (const section of doc.sections) {
    const rows = section.body
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (rows.length)
      blocks.push(
        [
          section.title,
          ...rows.map((line) => (section.list ? "• " + line : line)),
        ].join("\n"),
      );
  }
  if (resultStale(state))
    blocks.push("Устаревший черновик: ответы изменились.");
  const changed = sectionIds.filter(
    (id) => state.result!.edits[id] !== undefined,
  );
  if (changed.length)
    blocks.push(
      "Изменено вручную: " +
        changed.map((id) => sectionNames[id]).join(", ") +
        ".",
    );
  return blocks.join("\n\n");
}
