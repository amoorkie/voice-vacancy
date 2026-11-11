// Интервью и обзор используют один сеанс и остаются в правой панели при открытии превью.
import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Check, FileText, Mic, Square, X } from "lucide-react";
import { ProgressRing } from "../ProgressRing";
import { topics, unknownAnswer } from "../../domain/fixtures";
import { MAX_TEXT, validText, textLength } from "../../contracts/interview";
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
  const { state, dispatch } = session;
  const { index, active } = state;
  const answer = state.answers[index];
  const change = (text: string) => dispatch({ type: "edit", index, text });
  return (
    <div className="ix-editor">
      <div className="ix-label">
        <div>
          <label htmlFor="ix-answer">Расшифровка</label>
          {(answer.text || answer.confirmedText !== null) && (
            <small className="ix-answer-status">{answerStatus(answer)}</small>
          )}
        </div>
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
      <div className="ix-actions">
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
      {active?.phase === "waiting" && (
        <p role="status">
          Готовлю расшифровку…{" "}
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
  preview: () => void;
  previewActive: boolean;
};
/** Четыре подтверждения управляют одним кольцом, бейджами и доступностью черновика. */
export function InterviewPanel({
  session,
  navigate,
  close,
  preview,
  previewActive,
}: Props) {
  const { state, dispatch, start } = session;
  const { index, active, answers } = state;
  const count = answers.filter((a) => a.confirmed).length;
  const review = state.stage === "review" || state.stage === "result";
  const recording = active?.phase === "recording";
  const topic = topics[index];
  const answer = answers[index];
  const hasAnswer = answer.text.length > 0;
  const canConfirm = validText(answer.text);
  const pending = !!active && !recording;
  const draftLabel = previewActive
    ? "Превью открыто"
    : state.result
      ? "Открыть черновик"
      : "Создать черновик";
  const voiceLabel = review
    ? draftLabel
    : recording
      ? "Остановить запись"
      : active?.phase === "candidate"
        ? "Выберите действие с фрагментом"
        : pending
          ? "Обработка ответа…"
          : hasAnswer
            ? "Подтвердить ответ"
            : "Начать запись";

  /** Круг меняет действие на том же месте. Текст и готовность темы меняются только после явного подтверждения. */
  function mainAction() {
    if (
      previewActive ||
      pending ||
      (!review && !recording && hasAnswer && !canConfirm)
    )
      return;
    if (review) preview();
    else if (recording) dispatch({ type: "stop" });
    else if (hasAnswer) dispatch({ type: "confirm" });
    else start("transcription");
  }
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
    if (scroll) scroll.scrollTop = 0;
  }, [index, review, previewActive]);
  return (
    <>
      <header className="ix-interview-head">
        <h2 className="sr-only" tabIndex={-1} id="ix-interview-title">
          Создание вакансии
        </h2>
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
          <ProgressRing completed={count} recording={recording} scan>
            <button
              id="ix-main-action"
              className="ix-glass"
              data-complete={count === 4}
              style={{ "--voice-level": session.voiceLevel } as CSSProperties}
              type="button"
              aria-disabled={
                previewActive ||
                pending ||
                (!review && !recording && hasAnswer && !canConfirm)
              }
              aria-label={voiceLabel}
              onClick={mainAction}
            >
              {review ? (
                <FileText />
              ) : recording ? (
                <Square />
              ) : hasAnswer && !pending ? (
                <Check />
              ) : (
                <Mic />
              )}
            </button>
          </ProgressRing>
          <label
            className="ix-action-label"
            htmlFor="ix-main-action"
            aria-live="polite"
          >
            {voiceLabel}
          </label>
          {!review && !active && hasAnswer && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => start("transcription")}
            >
              <Mic />
              Дополнить запись
            </Button>
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
                  <span className="ix-topic-dot" />
                )}
                <span className="ix-topic-full">
                  {
                    ["Задачи", "Первые полгода", "Дальнейший фокус", "Знания"][
                      i
                    ]
                  }
                </span>
                <span className="ix-topic-short">
                  {["Задачи", "Полгода", "Дальше", "Знания"][i]}
                </span>
              </Badge>
            </button>
          ))}
        </nav>
        {!review && (
          <div className="ix-question">
            <h3 ref={heading} tabIndex={-1}>
              {topic.title}
            </h3>
            <p>{topic.hint}</p>
          </div>
        )}
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
            <TranscriptEditor session={session} />
          </>
        )}
        {!previewActive && state.message && (
          <p className="ix-feedback" role="status">
            {state.message}
          </p>
        )}
      </div>
      {!review && state.result && (
        <footer className="ix-foot ix-interview-foot">
          <Button onClick={preview}>
            <FileText />
            Открыть черновик
          </Button>
        </footer>
      )}
    </>
  );
}
