// Строит один документ для чтения, копирования и файла из текущей редакции шести разделов.
import {
  sectionIds,
  sectionNames,
  type SectionId,
} from "../../contracts/interview";
import { resultStale, type Result, type Session } from "../../domain/session";

/** Сохраняет порядок исходных фраз и принимает обычные маркеры списка при ручной правке. */
function lines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Первая короткая строка с названием становится заголовком. Условия без названия остаются в основном тексте. */
export function vacancyDocument(result: Result) {
  const current = (id: SectionId) =>
    result.edits[id] ?? result.generated.sections[id];
  const role = current("role").trim();
  const roleLines = lines(role);
  const firstClaim = result.generated.claims?.role?.[0];
  const named =
    result.edits.role !== undefined ||
    (result.generated.origin === "ai"
      ? firstClaim?.id === "role-title" && firstClaim.kind === "fact"
      : !!result.generated.sources.role?.length);
  const title = named && roleLines.length ? roleLines[0] : "Вакансия";
  const intro = named ? roleLines.slice(1) : roleLines;
  const sections = sectionIds
    .filter((id) => id !== "role")
    .map((id) => {
      const list = id === "tasks" || id === "skills" || id === "clarifications";
      const body = lines(current(id)).map((line) =>
        list ? line.replace(/^[-•*]\s+/u, "") : line,
      );
      return { id, title: sectionNames[id], list, body };
    });
  return { title, intro, sections };
}

/** Выгружает ту же редакцию и маркирует устаревшие источники и ручные изменения. */
export function vacancyDocumentText(state: Session) {
  if (!state.result) return "";
  const doc = vacancyDocument(state.result);
  const blocks = [
    doc.title,
    ...doc.intro,
    ...doc.sections
      .filter((s) => s.body.length)
      .map((s) =>
        [s.title, ...s.body.map((text) => (s.list ? "• " + text : text))].join(
          "\n",
        ),
      ),
  ];
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
