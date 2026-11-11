// Общий сеанс для самостоятельного интервью и панелей кабинета.
import { useEffect, useRef, useReducer, useState } from "react";
import { initialSession, sessionReducer } from "../../domain/session";
import { workspaceSamples } from "../../domain/fixtures";
import { runFixture } from "../fixture-adapter";
import { runOwnerApi, type RuntimeConfig } from "../owner-adapter";
import type { OperationKind } from "../../contracts/interview";

/** Хранит ответы и редактируемый результат, выполняет и отменяет операции одного сеанса. */
export function useInterviewSession(demo: boolean) {
  const [runtime, setRuntime] = useState<RuntimeConfig | undefined>(() =>
    demo ? { mode: "fixtures", csrfToken: "", model: null } : undefined,
  );
  const [state, dispatch] = useReducer(sessionReducer, undefined, () => {
    const session = initialSession();
    return demo ? sessionReducer(session, { type: "begin" }) : session;
  });
  const latest = useRef(state);
  latest.current = state;
  const active = state.active;
  const recording = active?.phase === "recording";
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (demo) return;
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
  }, [demo]);

  useEffect(() => {
    if (active?.phase !== "waiting") return;
    if (!runtime) return;
    if (active.kind === "transcription" || runtime.mode === "fixtures")
      return runFixture(
        active,
        latest.current,
        dispatch,
        demo ? workspaceSamples : undefined,
      );
    return runOwnerApi(active, latest.current, runtime, dispatch);
  }, [active?.id, active?.phase, runtime, demo]);
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

  return { state, dispatch, runtime, seconds, start, copy };
}
export type InterviewSession = ReturnType<typeof useInterviewSession>;
