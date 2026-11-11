// Интервью и обзор используют один сеанс и остаются в правой панели при открытии превью.
import { useLayoutEffect, useRef } from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { AudioLines, Check, FileText, Mic, Square, X } from "lucide-react";
import { ProgressRing } from "../ProgressRing";
import { topics, unknownAnswer } from "../../domain/fixtures";
import { MAX_TEXT, validText, textLength } from "../../contracts/interview";
import type { InterviewSession } from "../interview/useInterviewSession";
import type { Answer } from "../../domain/session";

/** Подпись бейджа различает новый текст и правку уже подтверждённой версии. */
function answerStatus(answer: Answer) {
  if (answer.confirmed) return "Готово";
  if (answer.confirmedText !== null) return "Есть изменения";
  return answer.text ? "Есть ответ" : "Без ответа";
}

/** Показывает настоящее ожидание ASR без выдуманных слов и процентов. */
function TranscriptionPending({ cancel }: { cancel: () => void }) {
  return (
    <div className="ix-transcription" role="status">
      <div className="ix-transcription-top">
        <div className="ix-transcription-caption">
          <span className="ix-transcription-wave" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>Распознаю речь</span>
        </div>
        <Button variant="ghost" size="sm" onClick={cancel}>
          Отменить
        </Button>
      </div>
      <div className="ix-transcription-lines" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

/** Оставляет полученный текст в поле своей темы даже после автоматического перехода дальше. */
function TranscriptEditor({
  session,
  index,
}: {
  session: InterviewSession;
  index: number;
}) {
  const { state, dispatch } = session;
  const current = index === state.index;
  const answer = state.answers[index];
  const pending =
    current &&
    state.active?.kind === "transcription" &&
    state.active.phase === "waiting";
  const fieldId = current ? "ix-answer" : "ix-answer-" + index;
  const change = (text: string) => dispatch({ type: "edit", index, text });
  return (
    <div className="ix-editor" data-current={current}>
      <div className="ix-label">
        <div>
          {pending && !answer.text ? (
            <span className="ix-transcript-label">Расшифровка</span>
          ) : (
            <label htmlFor={fieldId}>
              {current ? "Расшифровка" : topics[index].short}
            </label>
          )}
          {(answer.text || answer.confirmedText !== null) && (
            <small className="ix-answer-status">{answerStatus(answer)}</small>
          )}
        </div>
      </div>
      {(!pending || answer.text) && (
        <Textarea
          id={fieldId}
          value={answer.text}
          aria-busy={pending}
          readOnly={pending || (!current && !!state.active)}
          onChange={(event) => change(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key !== "Enter" ||
              event.shiftKey ||
              event.nativeEvent.isComposing
            )
              return;
            event.preventDefault();
            if (!state.active) {
              // Enter в прежнем поле завершает именно его версию, не пустой ответ следующей темы.
              if (!current) dispatch({ type: "navigate", index });
              dispatch({ type: "confirm" });
            }
          }}
          placeholder="Напишите ответ и нажмите Enter. Новая строка — Shift+Enter."
          aria-invalid={textLength(answer.text) > MAX_TEXT}
        />
      )}
      {pending && (
        <TranscriptionPending cancel={() => dispatch({ type: "cancel" })} />
      )}
      {textLength(answer.text) > MAX_TEXT && (
        <p role="alert">
          Сократите ответ до {MAX_TEXT} символов. Сейчас{" "}
          {textLength(answer.text)}.
        </p>
      )}
      {!pending &&
        (current || (answer.confirmedText !== null && !answer.confirmed)) && (
          <div className="ix-actions">
            {current && (
              <Button
                variant="ghost"
                size="sm"
                disabled={!!state.active}
                onClick={() => {
                  change(unknownAnswer);
                  dispatch({ type: "confirm" });
                }}
              >
                Пока не знаю
              </Button>
            )}
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
/** Завершённые темы управляют кольцом и автосборкой; круг управляет только записью и повторным открытием. */
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
      : pending
        ? "Распознаю речь…"
        : hasAnswer
          ? "Дополнить запись"
          : "Начать запись";

  /** Одна кнопка начинает и останавливает запись; расшифровка сама завершает тему. */
  function mainAction() {
    if (previewActive || pending) return;
    if (review) preview();
    else if (recording) dispatch({ type: "stop" });
    else start("transcription", true);
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
          <ProgressRing
            completed={count}
            recording={recording}
            voiceLevel={session.voiceLevel}
            scan
          >
            <button
              id="ix-main-action"
              className="ix-glass"
              data-complete={count === 4}
              type="button"
              aria-disabled={previewActive || pending}
              aria-label={voiceLabel}
              onClick={mainAction}
            >
              {review ? (
                <FileText />
              ) : recording ? (
                <Square />
              ) : pending ? (
                <AudioLines />
              ) : (
                <Mic />
              )}
            </button>
          </ProgressRing>
          <label
            className="ix-action-label"
            htmlFor="ix-main-action"
            aria-live={pending ? "off" : "polite"}
          >
            {voiceLabel}
          </label>
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
                data-done={validText(answers[i].text)}
                data-active={!review && i === index}
              >
                {validText(answers[i].text) ? (
                  <Check className="ix-topic-check" aria-hidden="true" />
                ) : (
                  <span className="ix-topic-dot" aria-hidden="true" />
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
          <section className="ix-transcripts" aria-label="Ответы по темам">
            {answers.map((answer, i) =>
              i === index || answer.text || answer.confirmedText !== null ? (
                <TranscriptEditor
                  key={topics[i].id}
                  session={session}
                  index={i}
                />
              ) : null,
            )}
          </section>
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
