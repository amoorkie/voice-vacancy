// Клиент обращается только к своему серверу и не получает ключ внешнего сервиса.
import type { Action, Attempt, Session } from "../domain/session";
import { topics } from "../domain/fixtures";
import {
  parseEvaluation,
  parseDraft,
  type DraftInput,
  type EvaluationInput,
} from "../contracts/owner-api";
import type { Draft } from "../contracts/interview";
export type RuntimeConfig = {
  mode: "fixtures" | "api" | "unavailable";
  csrfToken: string;
  model: string | null;
};

/** Выполняет одну попытку; отмена при правке не оставляет фоновой повторной отправки. */
export function runOwnerApi(
  attempt: Attempt,
  state: Session,
  config: RuntimeConfig,
  deliver: (action: Action) => void,
) {
  const controller = new AbortController();
  let cancelled = false;
  const isEvaluation = attempt.kind === "evaluation";
  const input: EvaluationInput | DraftInput = isEvaluation
    ? {
        requestId: attempt.id,
        sessionId: state.id,
        questionId: topics[attempt.question].id,
        revision: attempt.revision,
        text: state.answers[attempt.question].text,
        followUpUsed: state.answers[attempt.question].followUpUsed,
        rubricVersion: "rubric-v1",
      }
    : {
        requestId: attempt.id,
        sessionId: state.id,
        snapshotId: attempt.snapshot,
        draftEditRevision: attempt.editRevision,
        answers: state.answers.map((a, i) => ({
          questionId: topics[i].id,
          confirmedRevision: a.confirmedRevision,
          text: a.confirmedText!,
        })),
      };
  const timer = window.setTimeout(
    () => controller.abort(),
    isEvaluation ? 20000 : 60000,
  );
  void (async () => {
    try {
      const response = await fetch(
        `${import.meta.env.BASE_URL}api/${isEvaluation ? "completeness" : "vacancy"}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Demo-Token": config.csrfToken,
          },
          body: JSON.stringify(input),
          signal: controller.signal,
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          typeof data.message === "string"
            ? data.message
            : "Сервис недоступен. Ваш текст сохранён.",
        );
      if (data.requestId !== attempt.id || data.sessionId !== state.id)
        throw new Error("Пришёл ответ от другой попытки.");
      if (cancelled) return;
      if ("text" in input)
        deliver({
          type: "evaluation",
          id: attempt.id,
          value: parseEvaluation(data.value, input),
        });
      else {
        let value: Draft | "insufficient" = data.value;
        if (value !== "insufficient") {
          // Повторно проверяем точные источники после транспорта и восстанавливаем текст из утверждений.
          if (value.origin !== "ai" || !value.claims)
            throw new Error("Неверный черновик");
          value = parseDraft(
            {
              kind: "draft",
              sections: Object.entries(value.claims).map(([id, items]) => ({
                id,
                items,
              })),
            },
            input,
          );
        }
        deliver({ type: "generated", id: attempt.id, value });
      }
    } catch (error) {
      if (!cancelled)
        deliver({
          type: "failure",
          id: attempt.id,
          text: controller.signal.aborted
            ? "Время ожидания истекло. Ваш текст сохранён."
            : error instanceof Error
              ? error.message
              : "Запрос не выполнен. Ваш текст сохранён.",
        });
    } finally {
      window.clearTimeout(timer);
    }
  })();
  return () => {
    cancelled = true;
    controller.abort();
    window.clearTimeout(timer);
  };
}
