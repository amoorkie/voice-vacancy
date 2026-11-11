// Единственный адаптер этого среза. Он работает в памяти и не содержит fetch или SDK провайдера.
import { fixtureDraft, fixtureEvaluation, topics } from "../domain/fixtures";
import { validateEvaluation } from "../contracts/interview";
import type { Action, Attempt, Session } from "../domain/session";

/** Имитирует ожидание и управляемые ошибки, сохраняя возможность отмены таймера. */
export function runFixture(
  attempt: Attempt,
  state: Session,
  deliver: (action: Action) => void,
) {
  const timer = window.setTimeout(
    () => {
      if (attempt.outcome !== "success") {
        deliver({
          type: "failure",
          id: attempt.id,
          text:
            attempt.outcome === "timeout"
              ? "Тестовое время ожидания истекло. Попробуйте ещё раз или продолжите с текстом."
              : "Тестовый сервис недоступен. Ваш текст сохранён. Можно повторить действие.",
        });
        return;
      }
      if (attempt.kind === "transcription")
        deliver({
          type: "transcript",
          id: attempt.id,
          text: topics[attempt.question].sample,
        });
      if (attempt.kind === "evaluation") {
        const topic = topics[attempt.question];
        const text = state.answers[attempt.question].text;
        const value = fixtureEvaluation(topic.id, text);
        deliver({
          type: "evaluation",
          id: attempt.id,
          value: value ? validateEvaluation(value, topic.id, text) : null,
        });
      }
      if (attempt.kind === "generation")
        deliver({
          type: "generated",
          id: attempt.id,
          value: fixtureDraft(state.answers.map((a) => a.confirmedText!)),
        });
    },
    attempt.outcome === "timeout" ? 1400 : 650,
  );
  return () => window.clearTimeout(timer);
}
