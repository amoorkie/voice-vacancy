// Общий сеанс для самостоятельного интервью и панелей кабинета.
import { useCallback, useEffect, useRef, useReducer, useState } from "react";
import {
  initialSession,
  sessionReducer,
  type Action,
} from "../../domain/session";
import { workspaceSamples } from "../../domain/fixtures";
import { runFixture } from "../fixture-adapter";
import { runOwnerApi, type RuntimeConfig } from "../owner-adapter";
import type { OperationKind } from "../../contracts/interview";
import { openMicrophone } from "./microphone";

/** Хранит ответы и редактируемый результат, выполняет и отменяет операции одного сеанса. */
export function useInterviewSession(workspace: boolean) {
  const [runtime, setRuntime] = useState<RuntimeConfig>();
  const [state, dispatch] = useReducer(sessionReducer, undefined, () => {
    const session = initialSession();
    return workspace ? sessionReducer(session, { type: "begin" }) : session;
  });
  const latest = useRef(state);
  latest.current = state;
  const active = state.active;
  const recording = active?.phase === "recording";
  const [seconds, setSeconds] = useState(0);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const microphone = useRef<ReturnType<typeof openMicrophone> | null>(null);
  /** Кабинет завершает тему сразу по расшифровке; самостоятельный экран сохраняет прежний цикл. */
  const receive = useCallback(
    (action: Action) =>
      dispatch(
        workspace && action.type === "transcript"
          ? { ...action, autoAdvance: true }
          : action,
      ),
    [workspace],
  );
  useEffect(() => {
    const controller = new AbortController();
    void fetch(import.meta.env.BASE_URL + "api/config", {
      signal: controller.signal,
    })
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
    if (active?.phase !== "waiting") return;
    if (!runtime) return;
    if (active.kind === "transcription" && runtime.mode !== "fixtures") return;
    if (runtime.mode === "fixtures")
      return runFixture(
        active,
        latest.current,
        receive,
        workspace ? workspaceSamples : undefined,
      );
    return runOwnerApi(active, latest.current, runtime, dispatch);
  }, [active?.id, active?.phase, runtime, workspace, receive]);
  useEffect(() => {
    if (
      !active ||
      active.kind !== "transcription" ||
      !runtime ||
      runtime.mode === "fixtures"
    )
      return;
    if (runtime.voice !== "microphone") {
      dispatch({
        type: "failure",
        id: active.id,
        text: "Микрофон сейчас недоступен. Напишите ответ текстом.",
      });
      return;
    }
    const capture = openMicrophone(
      active,
      runtime,
      workspace,
      receive,
      setVoiceLevel,
    );
    microphone.current = capture;
    return () => {
      capture.cancel();
      if (microphone.current === capture) microphone.current = null;
    };
  }, [active?.id, runtime, workspace, receive]);
  useEffect(() => {
    if (
      active?.kind === "transcription" &&
      active.phase === "waiting" &&
      runtime?.mode !== "fixtures"
    )
      void microphone.current?.stop();
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
    // При скрытии вкладки прекращаю запись и освобождаю микрофон.
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

  /** Запускает одну попытку. Адаптер записи выбирается конфигурацией сервера. */
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

  return { state, dispatch, runtime, seconds, voiceLevel, start, copy };
}
export type InterviewSession = ReturnType<typeof useInterviewSession>;
