// Экспорт берёт видимую редакцию, включая ручные правки и пометки неполноты.
import { sectionIds, sectionNames } from "../contracts/interview";
import { topics } from "../domain/fixtures";
import { resultStale, type Session } from "../domain/session";

/** Формирует сводку из рабочих ответов, не заменяя их скрытой подтверждённой версией. */
export function summaryText(state: Session) {
  return [
    "Сводка ответов",
    "Оценка полноты не заменяет проверку фактов человеком.",
    ...state.answers.map(
      (a, i) =>
        `\n${i + 1}. ${topics[i].title}\n${a.confirmed ? "Подтверждено" : "Не подтверждено / не завершено"}${a.evaluation ? `; ${a.evaluation.kind === "ai" ? "оценка модели" : "тестовая оценка"}: ${a.evaluation.items.filter((item) => item.status === "present").length} из ${a.evaluation.items.length}, неизвестно: ${a.evaluation.items.filter((item) => item.status === "explicitly_unknown").length}` : "; полнота не проверена"}\n${a.text || "Ответ пока не заполнен"}`,
    ),
  ].join("\n");
}
/** Сохраняет текущие правки и состояние источников в текстовом результате. */
export function vacancyText(state: Session) {
  if (!state.result) return "";
  return [
    state.result.generated.origin === "ai"
      ? "Черновик вакансии — результат модели, проверьте факты"
      : "Черновик вакансии — тестовый пример",
    resultStale(state)
      ? "Устаревший черновик: ответы изменились."
      : "По текущим подтверждённым ответам.",
    ...sectionIds.map(
      (id) =>
        `\n${sectionNames[id]}${state.result!.edits[id] !== undefined ? " (изменено вручную)" : ""}\n${state.result!.edits[id] ?? state.result!.generated.sections[id]}`,
    ),
  ].join("\n");
}
/** Скачивает UTF-8 текст и освобождает временный object URL. */
export function downloadText(text: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
