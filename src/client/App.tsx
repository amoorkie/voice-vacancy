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
import { runOwnerApi, type RuntimeConfig } from "./owner-adapter";
import { downloadText, summaryText, vacancyText } from "./export";
import {
  MicrophoneIcon,
  ArrowRightIcon,
  CheckIcon,
  DownloadSimpleIcon,
  ArrowLeftIcon,
  KeyboardIcon,
  StopIcon,
  CircleNotchIcon,
} from "@phosphor-icons/react";
import { ProgressRing } from "./ProgressRing";

/** Библиотечные иконки сохраняют единый рисунок; смысл действий есть в текстовых подписях. */
function Icon({
  name,
}: {
  name:
    | "mic"
    | "arrow"
    | "check"
    | "download"
    | "back"
    | "keyboard"
    | "stop"
    | "loading";
}) {
  const Component = {
    mic: MicrophoneIcon,
    arrow: ArrowRightIcon,
    check: CheckIcon,
    download: DownloadSimpleIcon,
    back: ArrowLeftIcon,
    keyboard: KeyboardIcon,
    stop: StopIcon,
    loading: CircleNotchIcon,
  }[name];
  return (
    <Component
      aria-hidden="true"
      size={22}
      weight={name === "mic" ? "light" : "regular"}
    />
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

/** Соединяет доменные события с UI; тестовый адаптер запускается только для активной попытки. */
export function App() {
  const [runtime, setRuntime] = useState<RuntimeConfig>();
  const live = runtime?.mode === "api";
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
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
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
  const editorVisible =
    editingIndex === state.index || !!answer.text || !!candidate;
  const recordLabel = recording
    ? "Остановить запись"
    : busy
      ? "Обрабатываем ответ…"
      : candidate
        ? "Проверьте расшифровку"
        : "Начать запись";

  const confirmed = state.answers.filter((a) => a.confirmed).length;
  const [previousConfirmed, setPreviousConfirmed] = useState(confirmed);
  useEffect(() => {
    // Обзор получает прежнее значение, чтобы последняя четверть заполнилась и после смены экрана.
    setPreviousConfirmed(confirmed);
  }, [confirmed]);
  const present = answer.evaluation?.items.filter(
    (item) => item.status === "present",
  ).length;
  const unknown =
    answer.evaluation?.items.filter(
      (item) => item.status === "explicitly_unknown",
    ).length ?? 0;

  useEffect(() => {
    if (editingIndex === state.index) editor.current?.focus();
  }, [editingIndex, state.index]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/config", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Нет конфигурации");
        const config = await response.json();
        if (
          !["fixtures", "api", "unavailable"].includes(config.mode) ||
          typeof config.csrfToken !== "string"
        )
          throw new Error("Неверная конфигурация");
        setRuntime(config);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setRuntime({ mode: "unavailable", csrfToken: "", model: null });
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    setSupplement(null);
    setEditingIndex(null);
  }, [state.stage, state.index]);
  useEffect(() => {
    if (active?.phase !== "waiting") return;
    if (!runtime) return;
    if (active.kind === "transcription" || runtime.mode === "fixtures")
      return runFixture(active, latest.current, dispatch);
    return runOwnerApi(active, latest.current, runtime, dispatch);
  }, [active?.id, active?.phase, runtime]);
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

  /** Запускает выбранную обработку; голос пока остаётся явной имитацией. */
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
      setEditingIndex(state.index);
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
        title: live
          ? "Создать новый черновик?"
          : "Создать новый тестовый черновик?",
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

  /** Завершение сохраняет ответы; активную запись или расшифровку сначала явно отменяют. */
  function review() {
    if (recording || candidate)
      setModal({
        title: "Завершить интервью?",
        text: "Текущая тестовая запись или непринятая расшифровка будут отменены. Уже введённые ответы сохранятся в обзоре.",
        run: () => dispatch({ type: "review" }),
      });
    else dispatch({ type: "review" });
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a
          className="brand"
          href="#main"
          aria-label="Voice Vacancy, перейти к содержимому"
        >
          voice vacancy
        </a>
        <span className="header-purpose">Создание вакансии</span>
        {state.stage !== "intro" && (
          <button className="text-button finish-button" onClick={review}>
            Завершить
          </button>
        )}
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
              <ProgressRing completed={0} compact>
                <span className="glass-surface">
                  <img src="/assets/microphone-glass.png" alt="" />
                </span>
                <Icon name="mic" />
              </ProgressRing>
            </div>
            <button
              className="primary large"
              disabled={!runtime}
              onClick={() => dispatch({ type: "begin" })}
            >
              Начать интервью <Icon name="arrow" />
            </button>
            <p className="intro-note">
              Можно отвечать текстом. Если чего-то не знаете — так и напишите.
            </p>
            <div className="intro-notice">
              <strong>
                {live
                  ? "Проверка и черновик через ваш API"
                  : "Пока проверяем сценарий"}
              </strong>
              <p>
                {live
                  ? "По нажатию проверки текст отправляется в api.wikivibe.dev. Срок хранения на стороне сервиса пока не подтверждён. Микрофон ещё не подключён: запись использует пример."
                  : runtime?.mode === "unavailable"
                    ? "Конфигурация API недоступна. Можно заполнить ответы и скачать сводку; ошибка не подменяется готовым результатом."
                    : "Запись и обработка работают на готовых примерах. Микрофон и внешний API не подключены."}
              </p>
              <p>
                Рабочая копия ответов останется в этой вкладке. Перед закрытием
                или обновлением скачайте текст.
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
            <nav className="topic-nav" aria-label="Темы интервью">
              {topics.map((item, index) => (
                <button
                  key={item.id}
                  onClick={() => navigate(index)}
                  aria-label={item.short}
                  aria-current={
                    state.stage === "interview" && state.index === index
                      ? "step"
                      : undefined
                  }
                  className={
                    state.answers[index].confirmed ? "is-confirmed" : ""
                  }
                >
                  <span className="topic-number" aria-hidden="true">
                    {state.answers[index].confirmed ? (
                      <Icon name="check" />
                    ) : (
                      `0${index + 1}`
                    )}
                  </span>
                  <span>{item.short}</span>
                  <span className="sr-only">
                    {state.answers[index].confirmed ? ", подтверждено" : ""}
                  </span>
                </button>
              ))}
            </nav>
            {state.result && state.stage !== "result" && (
              <button
                className="text-button result-return"
                onClick={() => dispatch({ type: "result" })}
              >
                Открыть черновик
              </button>
            )}
            <div
              className={`content ${state.stage === "interview" && !editorVisible ? "is-idle" : ""}`}
            >
              {state.stage === "interview" && (
                <section
                  className={`question-panel ${editorVisible ? "has-answer" : ""}`}
                >
                  <div className="question-top">
                    <span className="eyebrow">
                      {
                        [
                          "ЗАДАЧИ СОТРУДНИКА",
                          "ПЕРВОЕ ПОЛУГОДИЕ",
                          "ДАЛЬНЕЙШИЙ ФОКУС",
                          "ИНСТРУМЕНТЫ И ЗНАНИЯ",
                        ][state.index]
                      }
                    </span>
                  </div>
                  <h1 ref={heading} tabIndex={-1}>
                    {topic.title}
                  </h1>
                  <p className="question-hint">{topic.hint}</p>
                  <div className="voice-area">
                    <ProgressRing completed={confirmed} recording={!!recording}>
                      <button
                        id="record-action"
                        className={`glass-button ${busy ? "is-waiting" : ""}`}
                        aria-label={recordLabel}
                        aria-describedby="record-disclosure"
                        disabled={!!busy || !!candidate}
                        onClick={() =>
                          recording
                            ? dispatch({ type: "stop" })
                            : start("transcription")
                        }
                      >
                        <span className="glass-surface">
                          <img
                            src="/assets/microphone-glass.png"
                            alt=""
                            draggable="false"
                          />
                        </span>
                        <Icon
                          name={recording ? "stop" : busy ? "loading" : "mic"}
                        />
                      </button>
                    </ProgressRing>
                    <label
                      className="record-label"
                      htmlFor="record-action"
                      aria-hidden="true"
                    >
                      {recordLabel}
                    </label>
                    <p className="ring-caption" aria-live="polite">
                      Подтверждено {confirmed} из 4 тем
                    </p>
                    <p className="micro-note" id="record-disclosure">
                      {recording
                        ? `Тестовая запись · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} / 2:00`
                        : "Тестовая запись — без микрофона"}
                    </p>
                    {(recording || busy) && (
                      <button
                        className="text-button cancel-record"
                        onClick={() => dispatch({ type: "cancel" })}
                      >
                        Отменить
                      </button>
                    )}
                  </div>
                  {!editorVisible && (
                    <button
                      className="text-button text-alternative"
                      aria-expanded={false}
                      aria-controls="answer-workspace"
                      onClick={() => setEditingIndex(state.index)}
                    >
                      <Icon name="keyboard" />
                      Написать текстом
                    </button>
                  )}
                  <div
                    id="answer-workspace"
                    className="answer-workspace"
                    hidden={!editorVisible}
                  >
                    {candidate && (
                      <div className="notice candidate">
                        <strong>Тестовая расшифровка</strong>
                        <p>{active?.candidate}</p>
                        <div className="actions">
                          <button
                            className="primary"
                            onClick={() => {
                              setEditingIndex(state.index);
                              dispatch({ type: "apply-transcript" });
                            }}
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
                    {!answer.evaluation && (
                      <p className="coverage-count">
                        Полнота ответа ещё не проверена
                      </p>
                    )}
                    {answer.evaluation && (
                      <div className="evaluation">
                        <strong>
                          {present === answer.evaluation.items.length
                            ? live
                              ? "В ответе есть нужные сведения"
                              : "В примере есть нужные сведения"
                            : unknown
                              ? "Неизвестное отмечено — можно продолжать"
                              : live
                                ? "В ответе не хватает конкретики"
                                : "В примере не хватает конкретики"}
                        </strong>
                        <p className="coverage-count">
                          Есть сведения: {present} из{" "}
                          {answer.evaluation.items.length}; явно неизвестно:{" "}
                          {unknown}
                        </p>
                        <p>
                          {live
                            ? "Это оценка модели. Проверьте основания; ответ можно подтвердить с пробелами."
                            : "Это заранее подготовленная оценка примера, а не ответ модели."}
                        </p>
                        {live && (
                          <details>
                            <summary>Основания оценки</summary>
                            {answer.evaluation.items.map((item) => (
                              <p key={item.slotId}>
                                {item.reason}
                                {item.evidence.map((quote, i) => (
                                  <q key={i}>{quote}</q>
                                ))}
                              </p>
                            ))}
                            {answer.evaluation.conflicts?.map((conflict, i) => (
                              <div key={i}>
                                <strong>Нужно уточнить противоречие</strong>
                                {conflict.evidence.map((quote, j) => (
                                  <p key={j}>
                                    <q>{quote}</q>
                                  </p>
                                ))}
                              </div>
                            ))}
                          </details>
                        )}
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
                          onChange={(event) =>
                            setSupplement(event.target.value)
                          }
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
                  <div className="review-progress">
                    <ProgressRing
                      completed={confirmed}
                      initialCompleted={previousConfirmed}
                      compact
                    >
                      <strong>
                        {confirmed}
                        <span> / 4</span>
                      </strong>
                    </ProgressRing>
                    <p>Подтверждено {confirmed} из 4 тем</p>
                  </div>
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
                          ? `${a.evaluation.kind === "ai" ? "Оценка модели" : "Тестовая оценка"}: ${a.evaluation.items.filter((item) => item.status === "present").length}/${a.evaluation.items.length}; неизвестно: ${a.evaluation.items.filter((item) => item.status === "explicitly_unknown").length}`
                          : "Полнота не проверена"}
                      </small>
                    </article>
                  ))}
                  <div className="notice">
                    <strong>Следующий шаг — черновик вакансии</strong>
                    <p>
                      {live
                        ? "Передам четыре подтверждённых ответа в ваш API. Проверьте факты в готовом тексте."
                        : "В тестовом режиме он доступен для готовых примеров. Ваш произвольный текст можно сохранить в сводке."}
                    </p>
                    <button
                      className="primary"
                      disabled={confirmed < 4 || !!active}
                      onClick={generate}
                    >
                      {live ? "Создать черновик" : "Создать тестовый черновик"}{" "}
                      <Icon name="arrow" />
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
                    {state.result.generated.origin === "ai"
                      ? "ЧЕРНОВИК МОДЕЛИ · ПРОВЕРЬТЕ ФАКТЫ"
                      : "ТЕСТОВЫЙ ПРИМЕР · МОЖНО РЕДАКТИРОВАТЬ"}
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
                            {state.result!.generated.claims?.[id]
                              ? state.result!.generated.claims[id]!.map(
                                  (claim) => (
                                    <div key={claim.id}>
                                      <p>{claim.text}</p>
                                      {claim.sourceRefs.map((ref, i) => (
                                        <blockquote key={i}>
                                          {ref.quote}
                                        </blockquote>
                                      ))}
                                      {claim.reason === "not-mentioned" && (
                                        <p>Не указано в ответах</p>
                                      )}
                                    </div>
                                  ),
                                )
                              : state.result!.generated.sources[id]!.map(
                                  (source) => (
                                    <p key={source} className="preserve">
                                      {
                                        state.result!.sourceTexts[
                                          topics.findIndex(
                                            (t) => t.id === source,
                                          )
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
                  <strong>
                    {live ? "Готовим черновик…" : "Готовим тестовый черновик…"}
                  </strong>
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
                <summary>
                  {live ? "Управление интервью" : "Проверка тестового сценария"}
                </summary>
                {!live && (
                  <>
                    <p>
                      Все операции локальные. Ошибка и тайм-аут имитируются за
                      1–2 секунды.
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
                  </>
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
