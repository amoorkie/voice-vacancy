// Интервью и обзор используют один сеанс и остаются в правой панели при открытии превью.
import { useLayoutEffect, useRef } from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Check, FileText, Mic, Square, X, Link2 } from "lucide-react";
import { ProgressRing } from "../ProgressRing";
import { downloadText, summaryText } from "../export";
import {
  topics,
  workspaceSamples,
  unknownAnswer,
  conflictingSkills,
} from "../../domain/fixtures";
import {
  MAX_TEXT,
  validText,
  textLength,
  type Outcome,
} from "../../contracts/interview";
import type { InterviewSession } from "../interview/useInterviewSession";
import type { Answer } from "../../domain/session";

/** Подпись бейджа различает новый текст и правку уже подтверждённой версии. */
function answerStatus(answer: Answer) {
  if (answer.confirmed) return "Подтверждено";
  if (answer.confirmedText !== null) return "Есть изменения";
  return answer.text ? "Есть ответ" : "Без ответа";
}

/** Редактор текущей темы принимает расшифрованный фрагмент только по выбору пользователя. */
function TranscriptEditor({ session }: { session: InterviewSession }) {
  const { state, dispatch, start } = session;
  const { index, active } = state;
  const answer = state.answers[index];
  const evaluation = answer.evaluation;
  const change = (text: string) => dispatch({ type: "edit", index, text });
  return (
    <div className="ix-editor">
      <div className="ix-label">
        <label htmlFor="ix-answer">Расшифровка</label>
        <Button
          variant="ghost"
          size="sm"
          disabled={!!active}
          onClick={() => change(workspaceSamples[index])}
        >
          Вставить пример
        </Button>
      </div>
      <Textarea
        id="ix-answer"
        value={answer.text}
        onChange={(event) => change(event.target.value)}
        placeholder="Запишите ответ или напишите здесь…"
        aria-invalid={textLength(answer.text) > MAX_TEXT}
      />
      {textLength(answer.text) > MAX_TEXT && (
        <p role="alert">
          Сократите ответ до {MAX_TEXT} символов. Сейчас{" "}
          {textLength(answer.text)}.
        </p>
      )}
      {active?.phase === "candidate" && (
        <section className="ix-fragment" aria-label="Новый фрагмент">
          <strong>Новый фрагмент</strong>
          <p>{active.candidate}</p>
          <div className="ix-actions">
            {answer.text && (
              <Button
                size="sm"
                onClick={() =>
                  dispatch({ type: "apply-transcript", append: true })
                }
              >
                Добавить к ответу
              </Button>
            )}
            <Button
              size="sm"
              variant={answer.text ? "outline" : "default"}
              onClick={() =>
                dispatch({ type: "apply-transcript", append: false })
              }
            >
              {answer.text ? "Заменить текст" : "Принять текст"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => dispatch({ type: "cancel" })}
            >
              Отказаться
            </Button>
          </div>
        </section>
      )}
      <div className="ix-actions">
        <Button
          variant="outline"
          size="sm"
          disabled={!!active || !validText(answer.text)}
          onClick={() => start("evaluation")}
        >
          Проверить полноту
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!!active}
          onClick={() => change(unknownAnswer)}
        >
          Пока не знаю
        </Button>
        {answer.confirmedText !== null && !answer.confirmed && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => dispatch({ type: "undo", index })}
          >
            Отменить правку
          </Button>
        )}
      </div>
      {evaluation && (
        <div className="ix-feedback">
          <strong>
            {evaluation.conflicts?.length
              ? "В ответе есть противоречие"
              : evaluation.items.every((i) => i.status === "present")
                ? "Ответ полный"
                : evaluation.items.every(
                      (i) => i.status === "explicitly_unknown",
                    )
                  ? "Отмечено как неизвестное"
                  : "Можно подробнее"}
          </strong>
          {evaluation.followUp && <p>{evaluation.followUp}</p>}
        </div>
      )}
      {active?.phase === "waiting" && (
        <p role="status">
          {active.kind === "evaluation"
            ? "Проверяю полноту…"
            : "Готовлю расшифровку…"}{" "}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dispatch({ type: "cancel" })}
          >
            Отменить
          </Button>
        </p>
      )}
    </div>
  );
}

type Props = {
  session: InterviewSession;
  navigate: (index: number) => void;
  close: () => void;
  connect: () => void;
  preview: () => void;
  previewActive: boolean;
};
/** Четыре подтверждения управляют одним кольцом, бейджами и доступностью черновика. */
export function InterviewPanel({
  session,
  navigate,
  close,
  connect,
  preview,
  previewActive,
}: Props) {
  const { state, dispatch, start, seconds } = session;
  const { index, active, answers } = state;
  const count = answers.filter((a) => a.confirmed).length;
  const review = state.stage === "review" || state.stage === "result";
  const recording = active?.phase === "recording";
  const topic = topics[index];
  const heading = useRef<HTMLHeadingElement>(null);
  const previous = useRef({ index, review });
  useLayoutEffect(() => {
    const changed =
      previous.current.index !== index || previous.current.review !== review;
    previous.current = { index, review };
    if (!changed || previewActive || !heading.current) return;
    // При смене темы читаем новый вопрос, не прокручивая кабинет за панелью.
    heading.current.focus({ preventScroll: true });
    const scroll = heading.current.closest(".ix-scroll");
    if (scroll) {
      const bounds = scroll.getBoundingClientRect();
      const label = heading.current.getBoundingClientRect();
      if (label.top < bounds.top || label.bottom > bounds.bottom)
        scroll.scrollTop += label.top - bounds.top - 16;
    }
  }, [index, review, previewActive]);
  return (
    <>
      <header className="ix-head">
        <div className="ix-titles">
          <span className="ix-eyebrow">
            <i />
            Искра · Демо-интервью
          </span>
          <h2 tabIndex={-1} id="ix-interview-title">
            Создание вакансии
          </h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="В кабинет"
          onClick={close}
        >
          <X />
        </Button>
      </header>
      <div className="ix-scroll">
        <div className="ix-voice">
          <ProgressRing completed={count} recording={recording}>
            <button
              className="ix-glass"
              type="button"
              disabled={review || (!!active && !recording)}
              aria-label={recording ? "Остановить запись" : "Начать запись"}
              onClick={() =>
                recording ? dispatch({ type: "stop" }) : start("transcription")
              }
            >
              <img src="/assets/microphone-glass.png" alt="" />
              {review ? <Check /> : recording ? <Square /> : <Mic />}
            </button>
          </ProgressRing>
          <strong>
            {review
              ? "Интервью собрано"
              : recording
                ? "Остановить запись"
                : active?.phase === "candidate"
                  ? "Проверьте расшифровку"
                  : active?.phase === "waiting"
                    ? "Обработка ответа…"
                    : "Начать запись"}
          </strong>
          <span>
            {recording
              ? "Демо-запись · " + seconds + " с"
              : "Темы: " + count + " из 4"}
          </span>
        </div>
        <nav className="ix-topics" aria-label="Темы интервью">
          {topics.map((item, i) => (
            <button
              type="button"
              key={item.id}
              title={answerStatus(answers[i])}
              aria-current={!review && i === index ? "step" : undefined}
              aria-label={item.short + " — " + answerStatus(answers[i])}
              onClick={() => navigate(i)}
            >
              <Badge
                variant="outline"
                data-done={answers[i].confirmed}
                data-active={!review && i === index}
              >
                {answers[i].confirmed ? (
                  <Check />
                ) : (
                  <span className="ix-num">0{i + 1}</span>
                )}
                {item.short}
              </Badge>
            </button>
          ))}
        </nav>
        {review ? (
          <section className="ix-review">
            <h3 ref={heading} tabIndex={-1}>
              Ваши ответы
            </h3>
            {answers.map((answer, i) => (
              <button
                className="ix-answer-row"
                key={topics[i].id}
                onClick={() => navigate(i)}
              >
                <strong>{topics[i].short}</strong>
                <span>{answer.text}</span>
              </button>
            ))}
          </section>
        ) : (
          <>
            <div className="ix-question">
              <span className="ix-question-status">
                {answerStatus(answers[index])}
              </span>
              <h3 ref={heading} tabIndex={-1}>
                {topic.title}
              </h3>
              <p>{topic.hint}</p>
            </div>
            <TranscriptEditor session={session} />
          </>
        )}
        {!previewActive && state.message && (
          <p className="ix-feedback" role="status">
            {state.message}
          </p>
        )}
        <details className="ix-demo-options">
          <summary>Параметры демо</summary>
          <label>
            Следующая операция{" "}
            <select
              value={state.outcome}
              onChange={(e) =>
                dispatch({
                  type: "outcome",
                  outcome: e.target.value as Outcome,
                })
              }
            >
              <option value="success">Успех</option>
              <option value="error">Ошибка</option>
              <option value="timeout">Тайм-аут</option>
            </select>
          </label>
          {!review && index === 3 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                dispatch({ type: "edit", index, text: conflictingSkills })
              }
            >
              Пример противоречия
            </Button>
          )}
        </details>
        <Button size="sm" variant="ghost" onClick={connect}>
          <Link2 />
          Подключить существующую
        </Button>
      </div>
      <footer className="ix-foot">
        <Button
          variant="ghost"
          size="sm"
          disabled={!answers.some((a) => a.text)}
          onClick={() => downloadText(summaryText(state), "сводка.txt")}
        >
          <FileText />
          Сводка .txt
        </Button>
        {!review && (
          <Button
            disabled={!validText(answers[index].text) || !!active}
            onClick={() => dispatch({ type: "confirm" })}
          >
            <Check />
            Подтвердить ответ
          </Button>
        )}
        {(review || state.result) && (
          <Button
            disabled={previewActive || (!state.result && count !== 4)}
            onClick={preview}
          >
            <FileText />
            {previewActive
              ? "Превью открыто"
              : state.result
                ? "Открыть черновик"
                : "Создать черновик"}
          </Button>
        )}
      </footer>
    </>
  );
}
