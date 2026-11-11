// Сеанс живёт только в памяти. Reducer централизует подтверждения и защиту от поздних ответов.
import {
  type Draft,
  type Evaluation,
  type OperationKind,
  type Outcome,
  type SectionId,
  type TopicId,
  validText,
} from "../contracts/interview";
import { topics } from "./fixtures";
export type Answer = {
  text: string;
  revision: number;
  confirmedText: string | null;
  confirmedRevision: number;
  confirmed: boolean;
  evaluation?: Evaluation;
  followUpUsed: boolean;
};
export type Attempt = {
  id: string;
  kind: OperationKind;
  phase: "recording" | "waiting" | "candidate";
  sessionId: string;
  question: number;
  revision: number;
  snapshot: string;
  editRevision: number;
  append: boolean;
  outcome: Outcome;
  candidate?: string;
};
export type Result = {
  snapshot: string;
  sourceTexts: string[];
  generated: Draft;
  edits: Partial<Record<SectionId, string>>;
};
export type Session = {
  id: string;
  stage: "intro" | "interview" | "review" | "result";
  index: number;
  answers: Answer[];
  active?: Attempt;
  result?: Result;
  editRevision: number;
  message: string;
  outcome: Outcome;
};
export type Action =
  | { type: "begin" }
  | { type: "edit"; index: number; text: string }
  | { type: "undo"; index: number }
  | { type: "confirm" }
  | { type: "navigate"; index: number }
  | { type: "review" }
  | { type: "result" }
  | { type: "reset"; id: string }
  | { type: "outcome"; outcome: Outcome }
  | {
      type: "start";
      id: string;
      kind: OperationKind;
      append?: boolean;
      recording?: boolean;
    }
  | { type: "stop" }
  | { type: "cancel" }
  | { type: "message"; text: string }
  | { type: "failure"; id: string; text: string }
  | {
      type: "transcript";
      id: string;
      text: string;
      fillEmpty?: boolean;
      autoAdvance?: boolean;
    }
  | { type: "apply-transcript"; append?: boolean }
  | { type: "evaluation"; id: string; value: Evaluation | null }
  | { type: "generated"; id: string; value: Draft | "insufficient" | null }
  | { type: "edit-result"; section: SectionId; text: string }
  | { type: "undo-result"; section: SectionId };

/** Начинает независимое интервью, не восстанавливая данные прошлой вкладки. */
export function initialSession(id: string = crypto.randomUUID()): Session {
  return {
    id,
    stage: "intro",
    index: 0,
    answers: topics.map(() => ({
      text: "",
      revision: 0,
      confirmedText: null,
      confirmedRevision: 0,
      confirmed: false,
      followUpUsed: false,
    })),
    editRevision: 0,
    message: "",
    outcome: "success",
  };
}
/** Снимок зависит от подтверждённых версий; ручной возврат текста сам их не подтверждает. */
export function snapshot(state: Session) {
  return JSON.stringify([
    state.id,
    ...state.answers.map((a) => [a.confirmedRevision, a.confirmedText]),
  ]);
}
/** Проверяет актуальность источников даже до получения повторного подтверждения. */
export function resultStale(state: Session) {
  return (
    !state.result ||
    state.answers.some((a) => !a.confirmed) ||
    state.result.snapshot !== snapshot(state)
  );
}
/** Защищает одновременно сеанс, попытку, тему, исходный текст и ручную редакцию результата. */
export function attemptCurrent(state: Session, id: string) {
  const a = state.active;
  return (
    !!a &&
    a.id === id &&
    a.sessionId === state.id &&
    (a.kind === "generation"
      ? a.snapshot === snapshot(state) &&
        state.answers.every((answer) => answer.confirmed) &&
        a.editRevision === state.editRevision
      : a.question === state.index &&
        a.revision === state.answers[a.question].revision)
  );
}
/** Применяет правку одной темы без потери подтверждённой версии для явной отмены. */
function editAnswer(state: Session, index: number, text: string): Session {
  if (state.answers[index].text === text) return state;
  return {
    ...state,
    active: undefined,
    message: "",
    answers: state.answers.map((a, i) =>
      i === index
        ? {
            ...a,
            text,
            revision: a.revision + 1,
            confirmed: false,
            evaluation: undefined,
          }
        : a,
    ),
  };
}
/** Обрабатывает события интерфейса; результаты отменённых операций всегда игнорируются. */
export function sessionReducer(state: Session, action: Action): Session {
  switch (action.type) {
    case "begin":
      return { ...state, stage: "interview" };
    case "edit":
      return editAnswer(state, action.index, action.text);
    case "undo": {
      const a = state.answers[action.index];
      const next = editAnswer(state, action.index, a.confirmedText ?? "");
      return {
        ...next,
        active: undefined,
        answers: next.answers.map((item, i) =>
          i === action.index
            ? { ...item, confirmed: item.confirmedText !== null }
            : item,
        ),
      };
    }
    case "confirm": {
      const a = state.answers[state.index];
      if (!validText(a.text) || state.active) return state;
      const answers = state.answers.map((item, i) =>
        i === state.index
          ? {
              ...item,
              confirmed: true,
              confirmedText: item.text,
              confirmedRevision:
                item.confirmedRevision +
                (item.text === item.confirmedText ? 0 : 1),
            }
          : item,
      );
      const next = answers.findIndex((item) => !item.confirmed);
      return {
        ...state,
        answers,
        index: next < 0 ? state.index : next,
        stage: next < 0 ? "review" : "interview",
        message: "",
      };
    }
    case "navigate":
      return {
        ...state,
        index: action.index,
        stage: "interview",
        active: undefined,
        message: "",
      };
    case "review":
      return { ...state, stage: "review", active: undefined, message: "" };
    case "result":
      return state.result
        ? { ...state, stage: "result", active: undefined, message: "" }
        : state;
    case "reset":
      return initialSession(action.id);
    case "outcome":
      return { ...state, outcome: action.outcome };
    case "message":
      return { ...state, message: action.text };
    case "start": {
      if (
        state.active ||
        (action.kind === "evaluation" &&
          !validText(state.answers[state.index].text)) ||
        (action.kind === "generation" &&
          state.answers.some((a) => !a.confirmed))
      )
        return state;
      return {
        ...state,
        message: "",
        outcome: "success",
        active: {
          id: action.id,
          kind: action.kind,
          phase: action.recording ? "recording" : "waiting",
          sessionId: state.id,
          question: state.index,
          revision: state.answers[state.index].revision,
          snapshot: snapshot(state),
          editRevision: state.editRevision,
          append: !!action.append,
          outcome: state.outcome,
        },
      };
    }
    case "stop":
      return state.active?.phase === "recording"
        ? { ...state, active: { ...state.active, phase: "waiting" } }
        : state;
    case "cancel":
      return {
        ...state,
        active: undefined,
        message: "Действие отменено. Ваш текст сохранён.",
      };
    case "failure":
      return attemptCurrent(state, action.id)
        ? { ...state, active: undefined, message: action.text }
        : state;
    case "transcript": {
      if (
        !attemptCurrent(state, action.id) ||
        state.active?.kind !== "transcription"
      )
        return state;
      // Кабинет принимает текст и завершает тему атомарно; отменённая или пустая запись не продвигает интервью.
      if (action.autoAdvance) {
        if (!action.text.trim())
          return {
            ...state,
            active: undefined,
            message:
              "Речь не распознана. Попробуйте ещё раз или напишите ответ.",
          };
        const text = state.active.append
          ? [state.answers[state.index].text, action.text]
              .filter(Boolean)
              .join("\n")
          : action.text;
        const next = {
          ...editAnswer(state, state.index, text),
          active: undefined,
        };
        // Полный слишком длинный ответ остаётся в редакторе для сокращения.
        return sessionReducer(next, { type: "confirm" });
      }
      // Самостоятельный ранний экран сохраняет ручной выбор расшифрованного фрагмента.
      if (action.fillEmpty && !state.answers[state.index].text)
        return editAnswer(state, state.index, action.text);
      return {
        ...state,
        active: {
          ...state.active!,
          phase: "candidate",
          candidate: action.text,
        },
      };
    }
    case "apply-transcript": {
      const a = state.active;
      if (!a || a.phase !== "candidate" || !attemptCurrent(state, a.id))
        return state;
      const text =
        (action.append ?? a.append)
          ? [state.answers[state.index].text, a.candidate]
              .filter(Boolean)
              .join("\n")
          : a.candidate!;
      return { ...editAnswer(state, state.index, text), active: undefined };
    }
    case "evaluation": {
      if (!attemptCurrent(state, action.id)) return state;
      const a = state.answers[state.index];
      const evaluation = action.value
        ? {
            ...action.value,
            followUp: a.followUpUsed ? undefined : action.value.followUp,
          }
        : undefined;
      return {
        ...state,
        active: undefined,
        message: evaluation
          ? ""
          : "Для этого текста нет тестовой оценки. Можно подтвердить ответ без проверки.",
        answers: state.answers.map((item, i) =>
          i === state.index
            ? {
                ...item,
                evaluation,
                followUpUsed: item.followUpUsed || !!evaluation?.followUp,
              }
            : item,
        ),
      };
    }
    case "generated": {
      if (!attemptCurrent(state, action.id)) return state;
      if (!action.value || action.value === "insufficient")
        return {
          ...state,
          active: undefined,
          message:
            action.value === "insufficient"
              ? "Пока недостаточно сведений о работе. Вернитесь к ответам и дополните их."
              : "Не удалось собрать черновик для этих ответов. Ваш текст сохранён.",
        };
      return {
        ...state,
        active: undefined,
        stage: "result",
        result: {
          snapshot: snapshot(state),
          sourceTexts: state.answers.map((a) => a.confirmedText!),
          generated: action.value,
          edits: {},
        },
        editRevision: state.editRevision + 1,
      };
    }
    case "edit-result":
      return state.result
        ? {
            ...state,
            active: undefined,
            editRevision: state.editRevision + 1,
            result: {
              ...state.result,
              edits: { ...state.result.edits, [action.section]: action.text },
            },
          }
        : state;
    case "undo-result": {
      if (!state.result) return state;
      const edits = { ...state.result.edits };
      delete edits[action.section];
      return {
        ...state,
        active: undefined,
        editRevision: state.editRevision + 1,
        result: { ...state.result, edits },
      };
    }
  }
}
