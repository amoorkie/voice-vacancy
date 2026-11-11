// Первый экран и связанный тестовый путь: ввод, проверка, сводка и редактор результата.
import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import {
  MAX_TEXT,
  sectionIds,
  sectionNames,
  textLength,
  validText,
  type OperationKind,
  type Outcome,
} from "../contracts/interview";
import {
  topics,
  unknownAnswer,
  vagueAnswer,
  followUpAnswer,
} from "../domain/fixtures";
import { initialSession, resultStale, sessionReducer } from "../domain/session";
import { runFixture } from "./fixture-adapter";
import { downloadText, summaryText, vacancyText } from "./export";

/** Единый набор простых векторных иконок; смысл всегда есть и в подписи кнопки. */
function Icon({
  name,
}: {
  name: "mic" | "arrow" | "check" | "download" | "back";
}) {
  const paths = {
    mic: "M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0z M5 11v1a7 7 0 0 0 14 0v-1 M12 19v3 M8 22h8",
    arrow: "M5 12h14 M13 6l6 6-6 6",
    check: "M5 12l4 4L19 6",
    download: "M12 3v12 M7 10l5 5 5-5 M5 17v4h14v-4",
    back: "M19 12H5 M11 6l-6 6 6 6",
  };
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}

/** Нативный modal dialog удерживает фокус и возвращает его вызвавшему действию. */
function ConfirmDialog({
  title,
  children,
  confirm,
  close,
}: {
  title: string;
  children: ReactNode;
  confirm: () => void;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => previous?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <h2 id="dialog-title">{title}</h2>
      <p>{children}</p>
      <div className="actions">
        <button onClick={close} autoFocus>
          Оставить как есть
        </button>
        <button className="primary" onClick={confirm}>
          Продолжить
        </button>
      </div>
    </dialog>
  );
}

/** Круг отображает смысловое покрытие текущей темы; до проверки не показывает выдуманный процент. */
function ProgressRing({
  present,
  total,
  unknown,
  recording,
  waiting,
}: {
  present?: number;
  total: number;
  unknown: number;
  recording: boolean;
  waiting: boolean;
}) {
  const circumference = 2 * Math.PI * 73;
  return (
    <div
      className={`ring ${recording ? "recording" : ""} ${waiting ? "waiting" : ""}`}
    >
      <svg className="ring-svg" viewBox="0 0 180 180" aria-hidden="true">
        <circle className="ring-track" cx="90" cy="90" r="73" />
        <circle
          className="ring-value"
          cx="90"
          cy="90"
          r="73"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - (present ?? 0) / total)}
        />
      </svg>
      <div className="ring-center">
        {recording ? (
          <span className="wave" aria-hidden="true">
            ▂ ▅ ▃ ▆ ▃
          </span>
        ) : waiting ? (
          <span className="waiting-dots" aria-hidden="true">
            ···
          </span>
        ) : present === undefined ? (
          <Icon name="mic" />
        ) : (
          <>
            <strong>
              {present}
              <span>/{total}</span>
            </strong>
          </>
        )}
      </div>
      <span className="sr-only">
        {recording
          ? "Тестовая запись"
          : waiting
            ? "Обработка примера"
            : present === undefined
              ? "Полнота не проверена"
              : `Есть сведения: ${present} из ${total}; явно неизвестно: ${unknown}`}
      </span>
      {present !== undefined && !recording && !waiting && (
        <meter
          className="sr-only"
          min="0"
          max={total}
          value={present}
          aria-label="Смысловое покрытие ответа"
        />
      )}
    </div>
  );
}

/** Соединяет доменные события с UI; тестовый адаптер запускается только для активной попытки. */
export function App() {
  const [state, dispatch] = useReducer(sessionReducer, undefined, () =>
    initialSession(),
  );
  const [modal, setModal] = useState<{
    title: string;
    text: string;
    run: () => void;
  }>();
  const [supplement, setSupplement] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const latest = useRef(state);
  latest.current = state;
  const answer = state.answers[state.index];
  const topic = topics[state.index];
  const active = state.active;
  const busy = active?.phase === "waiting";
  const recording = active?.phase === "recording";
  const candidate = active?.phase === "candidate";
  const confirmed = state.answers.filter((a) => a.confirmed).length;
  const present = answer.evaluation?.items.filter(
    (item) => item.status === "present",
  ).length;
  const unknown =
    answer.evaluation?.items.filter(
      (item) => item.status === "explicitly_unknown",
    ).length ?? 0;

  useEffect(() => {
    heading.current?.focus();
    setSupplement(null);
  }, [state.stage, state.index]);
  useEffect(() => {
    if (active?.phase !== "waiting") return;
    return runFixture(active, latest.current, dispatch);
  }, [active?.id, active?.phase]);
  useEffect(() => {
    if (!recording) {
      setSeconds(0);
      return;
    }
    const start = performance.now();
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((performance.now() - start) / 1000);
      setSeconds(elapsed);
      if (elapsed >= 120) dispatch({ type: "stop" });
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording]);
  useEffect(() => {
    // Скрытие вкладки отменяет именно имитацию записи: никаких скрытых отправок нет.
    const hide = () => {
      if (document.hidden && latest.current.active?.phase === "recording")
        dispatch({ type: "cancel" });
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (latest.current.answers.some((a) => a.text)) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  /** Запускает имитацию; реальный адаптер в этой сборке недоступен. */
  function start(kind: OperationKind, append = false) {
    dispatch({
      type: "start",
      id: crypto.randomUUID(),
      kind,
      append,
      recording: kind === "transcription",
    });
  }
  /** Просит согласие перед заменой уже введённого материала. */
  function replaceText(text: string) {
    const run = () => {
      dispatch({ type: "edit", index: state.index, text });
      editor.current?.focus();
    };
    if (answer.text && answer.text !== text)
      setModal({
        title: "Заменить текущий ответ?",
        text: "Сохранённый рабочий текст этой темы будет заменён выбранным примером.",
        run,
      });
    else run();
  }
  /** Сохраняет текст при невозможности использовать системный буфер. */
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      dispatch({ type: "message", text: "Текст скопирован." });
    } catch {
      dispatch({
        type: "message",
        text: "Не удалось скопировать. Скачайте .txt или выделите текст на экране.",
      });
    }
  }
  /** Повторная генерация не может молча заменить ручные правки. */
  function generate() {
    if (state.result && Object.keys(state.result.edits).length)
      setModal({
        title: "Создать новый тестовый черновик?",
        text: "При успешном результате он заменит ваши ручные правки. При ошибке текущий текст останется.",
        run: () => start("generation"),
      });
    else start("generation");
  }
  /** Навигация во время имитации записи сначала получает явное решение человека. */
  function navigate(index: number) {
    if (recording || candidate)
      setModal({
        title: "Перейти к другой теме?",
        text: "Тестовая запись или предложение текста будут отменены. Уже введённые ответы сохранятся.",
        run: () => dispatch({ type: "navigate", index }),
      });
    else dispatch({ type: "navigate", index });
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a
          className="brand"
          href="#main"
          aria-label="Voice Vacancy, перейти к содержимому"
        >
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          voice<span>vacancy</span>
        </a>
        <span className="demo-badge">
          <i />
          Тестовый прототип
        </span>
      </header>
      <main id="main">
        {state.stage === "intro" ? (
          <section className="intro">
            <div className="eyebrow">ОТ РАЗГОВОРА К ВАКАНСИИ</div>
            <h1 ref={heading} tabIndex={-1}>
              Сначала о работе.
              <br />
              <span>Потом о человеке.</span>
            </h1>
            <p className="intro-copy">
              Четыре коротких вопроса помогут собрать задачи, планы и навыки для
              будущего сотрудника.
            </p>
            <div className="intro-ring">
              <ProgressRing
                total={4}
                unknown={0}
                recording={false}
                waiting={false}
              />
            </div>
            <button
              className="primary large"
              onClick={() => dispatch({ type: "begin" })}
            >
              Начать интервью <Icon name="arrow" />
            </button>
            <p className="intro-note">
              Можно отвечать текстом. Если чего-то не знаете — так и напишите.
            </p>
            <div className="intro-notice">
              <strong>Пока проверяем сценарий</strong>
              <p>
                Запись и обработка работают на готовых примерах. Микрофон и
                внешний API не подключены.
              </p>
              <p>
                Ответы останутся только в этой вкладке. Перед закрытием или
                обновлением скачайте текст.
              </p>
            </div>
            <div className="intro-steps">
              <span>
                01 <b>Расскажите</b>
              </span>
              <span>
                02 <b>Проверьте</b>
              </span>
              <span>
                03 <b>Заберите черновик</b>
              </span>
            </div>
          </section>
        ) : (
          <div className="workspace">
            <aside className="sidebar" aria-label="Ход интервью">
              <div className="eyebrow">ВАША БУДУЩАЯ КОМАНДА</div>
              <h2>Начнём с главного</h2>
              <p>
                Что человек будет делать
                <br />и зачем это нужно.
              </p>
              <nav aria-label="Темы интервью">
                {topics.map((item, index) => (
                  <button
                    key={item.id}
                    onClick={() => navigate(index)}
                    aria-current={
                      state.stage === "interview" && state.index === index
                        ? "step"
                        : undefined
                    }
                  >
                    <span
                      className={`step-number ${state.answers[index].confirmed ? "done" : ""}`}
                    >
                      {state.answers[index].confirmed ? (
                        <Icon name="check" />
                      ) : (
                        `0${index + 1}`
                      )}
                    </span>
                    <span>
                      {item.short}
                      {state.answers[index].text &&
                        !state.answers[index].confirmed && (
                          <small>Черновик ответа</small>
                        )}
                    </span>
                  </button>
                ))}
              </nav>
              <div className="sidebar-bottom">
                <span>Подтверждено {confirmed} из 4</span>
                <button
                  className="text-button"
                  onClick={() => dispatch({ type: "review" })}
                >
                  К обзору ответов <Icon name="arrow" />
                </button>
                {state.result && (
                  <button
                    className="text-button"
                    onClick={() => dispatch({ type: "result" })}
                  >
                    Открыть черновик
                  </button>
                )}
              </div>
            </aside>
            <div className="content">
              {state.stage === "interview" && (
                <section className="question-panel" key={state.index}>
                  <div className="question-top">
                    <span className="eyebrow">
                      ВОПРОС {state.index + 1} ИЗ 4
                    </span>
                    <span className="muted">{topic.short}</span>
                  </div>
                  <h1 ref={heading} tabIndex={-1}>
                    {topic.title}
                  </h1>
                  <p className="question-hint">{topic.hint}</p>
                  <div className="voice-area">
                    <ProgressRing
                      present={present}
                      total={state.index === 3 ? 3 : 2}
                      unknown={unknown}
                      recording={!!recording}
                      waiting={!!busy}
                    />
                    <div className="ring-caption">
                      {recording
                        ? `Тестовая запись · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
                        : busy
                          ? active?.kind === "evaluation"
                            ? "Проверяем пример…"
                            : "Готовим тестовую расшифровку…"
                          : present === undefined
                            ? "Полнота не проверена"
                            : `Есть сведения: ${present} из ${state.index === 3 ? 3 : 2}${unknown ? ` · неизвестно: ${unknown}` : ""}`}
                    </div>
                    {recording ? (
                      <button
                        className="record-button"
                        onClick={() => dispatch({ type: "stop" })}
                      >
                        <span className="stop-icon" />
                        Остановить
                      </button>
                    ) : (
                      !active && (
                        <button
                          className="record-button"
                          onClick={() => start("transcription")}
                        >
                          <Icon name="mic" />
                          Попробовать тестовую запись
                        </button>
                      )
                    )}
                    {!active && (
                      <span className="micro-note">
                        Без микрофона — используем готовый пример
                      </span>
                    )}
                    {(recording || busy) && (
                      <button
                        className="text-button"
                        onClick={() => dispatch({ type: "cancel" })}
                      >
                        Отменить
                      </button>
                    )}
                  </div>
                  {candidate && (
                    <div className="notice candidate">
                      <strong>Тестовая расшифровка</strong>
                      <p>{active?.candidate}</p>
                      <div className="actions">
                        <button
                          className="primary"
                          onClick={() => dispatch({ type: "apply-transcript" })}
                        >
                          {active?.append
                            ? "Добавить к ответу"
                            : answer.text
                              ? "Заменить ответ"
                              : "Использовать текст"}
                        </button>
                        <button onClick={() => dispatch({ type: "cancel" })}>
                          Оставить свой текст
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="editor-heading">
                    <label htmlFor="answer">Ваш ответ</label>
                    <span>
                      {textLength(answer.text)} / {MAX_TEXT}
                    </span>
                  </div>
                  <textarea
                    id="answer"
                    ref={editor}
                    rows={4}
                    value={answer.text}
                    aria-describedby="answer-help answer-error"
                    aria-invalid={textLength(answer.text) > MAX_TEXT}
                    onChange={(event) =>
                      dispatch({
                        type: "edit",
                        index: state.index,
                        text: event.target.value,
                      })
                    }
                    placeholder="Напишите своими словами. Или начните с примера."
                  />
                  <p id="answer-error" className="error-text">
                    {textLength(answer.text) > MAX_TEXT
                      ? "Ответ длиннее 6000 символов. Сократите его, чтобы продолжить. Весь текст сохранён."
                      : ""}
                  </p>
                  <div className="editor-tools" id="answer-help">
                    <button
                      className="text-button"
                      disabled={!!active}
                      onClick={() => replaceText(topic.sample)}
                    >
                      Вставить пример
                    </button>
                    <button
                      className="text-button"
                      disabled={!!active}
                      onClick={() => replaceText(unknownAnswer)}
                    >
                      Пока не знаю
                    </button>
                    {answer.text && (
                      <button
                        className="text-button"
                        onClick={() =>
                          dispatch({ type: "undo", index: state.index })
                        }
                      >
                        Отменить изменения
                      </button>
                    )}
                  </div>
                  {answer.evaluation && (
                    <div className="evaluation">
                      <strong>
                        {present === answer.evaluation.items.length
                          ? "В примере есть нужные сведения"
                          : unknown
                            ? "Неизвестное отмечено — можно продолжать"
                            : "В примере не хватает конкретики"}
                      </strong>
                      <p>
                        Это заранее подготовленная оценка примера, а не ответ
                        модели.
                      </p>
                      {answer.evaluation.followUp && (
                        <>
                          <p className="follow-up">
                            {answer.evaluation.followUp}
                          </p>
                          <div className="actions">
                            <button onClick={() => setSupplement("")}>
                              Дополнить текстом
                            </button>
                            <button
                              disabled={!!active}
                              onClick={() => start("transcription", true)}
                            >
                              Дополнить тестовой записью
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {supplement !== null && (
                    <div className="notice">
                      <label htmlFor="supplement">Дополнение к ответу</label>
                      <textarea
                        id="supplement"
                        value={supplement}
                        onChange={(event) => setSupplement(event.target.value)}
                      />
                      <div className="actions">
                        <button onClick={() => setSupplement(followUpAnswer)}>
                          Вставить пример дополнения
                        </button>
                        <button
                          className="primary"
                          disabled={!supplement.trim()}
                          onClick={() => {
                            dispatch({
                              type: "edit",
                              index: state.index,
                              text: `${answer.text}\n${supplement}`,
                            });
                            setSupplement(null);
                          }}
                        >
                          Добавить к ответу
                        </button>
                        <button onClick={() => setSupplement(null)}>
                          Отменить дополнение
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="question-actions">
                    <button
                      disabled={!validText(answer.text) || !!active}
                      onClick={() => start("evaluation")}
                    >
                      Проверить ответ
                    </button>
                    <button
                      className="primary"
                      disabled={!validText(answer.text) || !!active}
                      onClick={() => dispatch({ type: "confirm" })}
                    >
                      {answer.evaluation
                        ? "Подтвердить и далее"
                        : "Подтвердить без проверки"}
                      <Icon name="arrow" />
                    </button>
                  </div>
                </section>
              )}
              {state.stage === "review" && (
                <section className="review-panel">
                  <span className="eyebrow">ВАШИ ОТВЕТЫ</span>
                  <h1 ref={heading} tabIndex={-1}>
                    Проверьте общую картину
                  </h1>
                  <p className="question-hint">
                    Исправьте детали или заберите сводку. Она доступна и без
                    создания вакансии.
                  </p>
                  {state.answers.map((a, index) => (
                    <article className="answer-card" key={topics[index].id}>
                      <div>
                        <span className="eyebrow">
                          0{index + 1} / {topics[index].short}
                        </span>
                        <button
                          className="text-button"
                          onClick={() => navigate(index)}
                        >
                          Изменить
                        </button>
                      </div>
                      <h2>{topics[index].title}</h2>
                      <p className="preserve">
                        {a.text || "Ответ пока не заполнен"}
                      </p>
                      <small>
                        {a.confirmed ? "Подтверждено" : "Не подтверждено"} ·{" "}
                        {a.evaluation
                          ? `Тестовая оценка: ${a.evaluation.items.filter((item) => item.status === "present").length}/${a.evaluation.items.length}; неизвестно: ${a.evaluation.items.filter((item) => item.status === "explicitly_unknown").length}`
                          : "Полнота не проверена"}
                      </small>
                    </article>
                  ))}
                  <div className="notice">
                    <strong>Следующий шаг — черновик вакансии</strong>
                    <p>
                      В тестовом режиме он доступен для готовых примеров. Ваш
                      произвольный текст можно сохранить в сводке.
                    </p>
                    <button
                      className="primary"
                      disabled={confirmed < 4 || !!active}
                      onClick={generate}
                    >
                      Создать тестовый черновик <Icon name="arrow" />
                    </button>
                    {confirmed < 4 && (
                      <p>Сначала подтвердите все четыре ответа.</p>
                    )}
                  </div>
                  <div className="actions">
                    <button
                      onClick={() => void copy(summaryText(state))}
                      disabled={!state.answers.some((a) => a.text.trim())}
                    >
                      Скопировать сводку
                    </button>
                    <button
                      onClick={() =>
                        downloadText(summaryText(state), "сводка-ответов.txt")
                      }
                      disabled={!state.answers.some((a) => a.text.trim())}
                    >
                      <Icon name="download" />
                      Скачать сводку
                    </button>
                  </div>
                </section>
              )}
              {state.stage === "result" && state.result && (
                <section className="result-panel">
                  <span className="eyebrow">
                    ТЕСТОВЫЙ ПРИМЕР · МОЖНО РЕДАКТИРОВАТЬ
                  </span>
                  <h1 ref={heading} tabIndex={-1}>
                    Основа вакансии готова
                  </h1>
                  <p className="question-hint">
                    Проверьте формулировки и добавьте детали. Это черновик для
                    обсуждения с рекрутером.
                  </p>
                  {resultStale(state) && (
                    <div className="notice warning">
                      <strong>Ответы изменились — черновик устарел</strong>
                      <p>
                        Можно сохранить текущую редакцию с пометкой или
                        вернуться к ответам.
                      </p>
                    </div>
                  )}
                  {sectionIds.map((id) => (
                    <article className="result-section" key={id}>
                      <div className="editor-heading">
                        <label htmlFor={`section-${id}`}>
                          {sectionNames[id]}
                        </label>
                        {state.result!.edits[id] !== undefined && (
                          <span>Изменено вручную</span>
                        )}
                      </div>
                      <textarea
                        id={`section-${id}`}
                        rows={3}
                        value={
                          state.result!.edits[id] ??
                          state.result!.generated.sections[id]
                        }
                        onChange={(event) =>
                          dispatch({
                            type: "edit-result",
                            section: id,
                            text: event.target.value,
                          })
                        }
                      />
                      {state.result!.edits[id] !== undefined ? (
                        <button
                          className="text-button"
                          onClick={() =>
                            dispatch({ type: "undo-result", section: id })
                          }
                        >
                          Вернуть исходный раздел
                        </button>
                      ) : (
                        state.result!.generated.sources[id] && (
                          <details>
                            <summary>На чём основан раздел</summary>
                            {state.result!.generated.sources[id]!.map(
                              (source) => (
                                <p key={source} className="preserve">
                                  {
                                    state.result!.sourceTexts[
                                      topics.findIndex((t) => t.id === source)
                                    ]
                                  }
                                </p>
                              ),
                            )}
                          </details>
                        )
                      )}
                    </article>
                  ))}
                  <div className="actions">
                    <button
                      className="primary"
                      onClick={() =>
                        downloadText(
                          vacancyText(state),
                          "черновик-вакансии.txt",
                        )
                      }
                    >
                      <Icon name="download" />
                      Скачать черновик
                    </button>
                    <button onClick={() => void copy(vacancyText(state))}>
                      Скопировать
                    </button>
                    <button
                      disabled={confirmed < 4 || !!active}
                      onClick={generate}
                    >
                      Создать заново
                    </button>
                  </div>
                  <button
                    className="text-button back-link"
                    onClick={() => dispatch({ type: "review" })}
                  >
                    <Icon name="back" />
                    Вернуться к ответам
                  </button>
                </section>
              )}
              {active?.kind === "generation" && (
                <div className="notice" role="status">
                  <strong>Готовим тестовый черновик…</strong>
                  <p>Ответы и текущая редакция остаются на месте.</p>
                  <button onClick={() => dispatch({ type: "cancel" })}>
                    Отменить
                  </button>
                </div>
              )}
              <div className="feedback" role="status" aria-live="polite">
                {state.message}
              </div>
              <footer className="workspace-footer">
                <span>
                  Только в этой вкладке. Перед закрытием сохраните текст.
                </span>
                <button
                  className="text-button"
                  disabled={!state.answers.some((a) => a.text.trim())}
                  onClick={() =>
                    downloadText(summaryText(state), "сводка-ответов.txt")
                  }
                >
                  <Icon name="download" />
                  Скачать ответы
                </button>
              </footer>
              <details className="test-settings">
                <summary>Проверка тестового сценария</summary>
                <p>
                  Все операции локальные. Ошибка и тайм-аут имитируются за 1–2
                  секунды.
                </p>
                <label htmlFor="outcome">Следующая тестовая операция</label>
                <select
                  id="outcome"
                  value={state.outcome}
                  onChange={(event) =>
                    dispatch({
                      type: "outcome",
                      outcome: event.target.value as Outcome,
                    })
                  }
                >
                  <option value="success">Успешный результат</option>
                  <option value="error">Сбой сервиса</option>
                  <option value="timeout">Тайм-аут</option>
                </select>
                {state.stage === "interview" && state.index === 0 && (
                  <button
                    disabled={!!active}
                    onClick={() => replaceText(vagueAnswer)}
                  >
                    Пример с нехваткой конкретики
                  </button>
                )}
                <button
                  onClick={() =>
                    setModal({
                      title: "Начать интервью заново?",
                      text: "Все ответы, оценки и правки черновика будут удалены из этой вкладки.",
                      run: () =>
                        dispatch({ type: "reset", id: crypto.randomUUID() }),
                    })
                  }
                >
                  Сбросить интервью
                </button>
              </details>
            </div>
          </div>
        )}
      </main>
      <footer className="site-footer">
        <span>VOICE VACANCY</span>
        <span>Хорошая вакансия начинается с понятной работы.</span>
        <span>Прототип · 2026</span>
      </footer>
      {modal && (
        <ConfirmDialog
          title={modal.title}
          close={() => setModal(undefined)}
          confirm={() => {
            modal.run();
            setModal(undefined);
          }}
        >
          {modal.text}
        </ConfirmDialog>
      )}
    </div>
  );
}
