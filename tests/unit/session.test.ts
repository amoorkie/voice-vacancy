// Проверки защищают материал пользователя при правках, отмене и поздних ответах.
import { describe, expect, test } from "vitest";
import {
  initialSession,
  sessionReducer as reduce,
  snapshot,
  resultStale,
  type Session,
} from "../../src/domain/session";
import {
  fixtureDraft,
  fixtureEvaluation,
  topics,
  unknownAnswer,
  vagueAnswer,
} from "../../src/domain/fixtures";
import {
  validateEvaluation,
  validText,
  textLength,
} from "../../src/contracts/interview";
import { summaryText, vacancyText } from "../../src/client/export";

/** Создаёт подтверждённый тестовый снимок через те же события, что и интерфейс. */
function confirmedSession() {
  let state = reduce(initialSession("test"), { type: "begin" });
  for (let i = 0; i < 4; i++) {
    state = reduce(state, { type: "edit", index: i, text: topics[i].sample });
    state = reduce(state, { type: "confirm" });
  }
  return state;
}
/** Получает результат через активную попытку, не обходя проверку её актуальности. */
function generatedSession() {
  let state = reduce(confirmedSession(), {
    type: "start",
    id: "gen-1",
    kind: "generation",
  });
  return reduce(state, {
    type: "generated",
    id: "gen-1",
    value: fixtureDraft(topics.map((t) => t.sample)),
  });
}

describe("версии и подтверждение", () => {
  test("правка и ручной возврат слов не подтверждают ответ; явная отмена восстанавливает", () => {
    const original = confirmedSession();
    let s = reduce(original, { type: "navigate", index: 0 });
    s = reduce(s, { type: "edit", index: 0, text: "Изменение" });
    s = reduce(s, { type: "edit", index: 0, text: topics[0].sample });
    expect(s.answers[0].confirmed).toBe(false);
    s = reduce(s, { type: "undo", index: 0 });
    expect(s.answers[0].confirmed).toBe(true);
    expect(snapshot(s)).toBe(snapshot(original));
  });
  test("навигация сохраняет текст и подтверждения остальных тем", () => {
    const s = reduce(confirmedSession(), { type: "navigate", index: 1 });
    expect(s.answers.every((a) => a.confirmed)).toBe(true);
    expect(s.answers[0].text).toBe(topics[0].sample);
  });
  test("следующий шаг — первая неподтверждённая тема", () => {
    let s = reduce(initialSession("test"), { type: "navigate", index: 2 });
    s = reduce(s, { type: "edit", index: 2, text: unknownAnswer });
    expect(reduce(s, { type: "confirm" }).index).toBe(0);
  });
  test("Unicode считается по code points, а превышение остаётся в редакторе", () => {
    expect(textLength("😀")).toBe(1);
    expect(validText("😀".repeat(6000))).toBe(true);
    let s = reduce(initialSession("test"), {
      type: "edit",
      index: 0,
      text: "😀".repeat(6001),
    });
    expect(reduce(s, { type: "confirm" }).answers[0].confirmed).toBe(false);
    expect(textLength(s.answers[0].text)).toBe(6001);
    expect(validText("   ")).toBe(false);
    expect(validText(unknownAnswer)).toBe(true);
  });
});

describe("асинхронные операции", () => {
  test.each(["cancel", "reset", "edit", "navigate"] as const)(
    "поздний текст после %s не применяется",
    (type) => {
      let s = reduce(initialSession("test"), {
        type: "start",
        id: "old",
        kind: "transcription",
      });
      if (type === "cancel") s = reduce(s, { type: "cancel" });
      if (type === "reset") s = reduce(s, { type: "reset", id: "new" });
      if (type === "edit")
        s = reduce(s, { type: "edit", index: 0, text: "Моя правка" });
      if (type === "navigate") s = reduce(s, { type: "navigate", index: 1 });
      expect(
        reduce(s, { type: "transcript", id: "old", text: "Поздний текст" }),
      ).toBe(s);
    },
  );
  test("повтор с теми же словами не принимает результат старой попытки", () => {
    let s = reduce(initialSession("test"), {
      type: "start",
      id: "old",
      kind: "transcription",
    });
    s = reduce(s, { type: "cancel" });
    s = reduce(s, { type: "start", id: "new", kind: "transcription" });
    expect(reduce(s, { type: "transcript", id: "old", text: "Старый" })).toBe(
      s,
    );
    expect(
      reduce(s, { type: "transcript", id: "new", text: "Новый" }).active
        ?.candidate,
    ).toBe("Новый");
  });
  test("дополнение не меняет текст до явного применения и добавляется с новой строки", () => {
    let s = reduce(initialSession("test"), {
      type: "edit",
      index: 0,
      text: vagueAnswer,
    });
    s = reduce(s, {
      type: "start",
      id: "append",
      kind: "transcription",
      append: true,
    });
    s = reduce(s, { type: "transcript", id: "append", text: topics[0].sample });
    expect(s.answers[0].text).toBe(vagueAnswer);
    s = reduce(s, { type: "apply-transcript" });
    expect(s.answers[0].text).toBe(`${vagueAnswer}\n${topics[0].sample}`);
  });
  test("одно уточнение не восстанавливается правкой и повтором оценки", () => {
    let s = reduce(initialSession("test"), {
      type: "edit",
      index: 0,
      text: vagueAnswer,
    });
    for (const id of ["first", "second"]) {
      s = reduce(s, { type: "start", id, kind: "evaluation" });
      s = reduce(s, {
        type: "evaluation",
        id,
        value: fixtureEvaluation("Q1", vagueAnswer),
      });
      expect(!!s.answers[0].evaluation?.followUp).toBe(id === "first");
    }
  });
});

describe("источники, редактор и экспорт", () => {
  test("редакция во время генерации не заменяется поздним результатом", () => {
    let s = reduce(generatedSession(), {
      type: "start",
      id: "again",
      kind: "generation",
    });
    s = reduce(s, {
      type: "edit-result",
      section: "tasks",
      text: "Моя редакция",
    });
    expect(
      reduce(s, {
        type: "generated",
        id: "again",
        value: fixtureDraft(topics.map((t) => t.sample)),
      }),
    ).toBe(s);
    expect(vacancyText(s)).toContain("Моя редакция");
  });
  test("источник старого черновика неизменен после нового подтверждения", () => {
    let s = generatedSession();
    s = reduce(s, { type: "navigate", index: 0 });
    s = reduce(s, { type: "edit", index: 0, text: "Новые задачи" });
    s = reduce(s, { type: "confirm" });
    expect(resultStale(s)).toBe(true);
    expect(s.result?.sourceTexts[0]).toBe(topics[0].sample);
    expect(vacancyText(s)).toContain("Устаревший");
  });
  test("отмена правки источника восстанавливает актуальность", () => {
    let s = reduce(generatedSession(), {
      type: "edit",
      index: 0,
      text: "Правка",
    });
    expect(resultStale(s)).toBe(true);
    s = reduce(s, { type: "undo", index: 0 });
    expect(resultStale(s)).toBe(false);
  });
  test.each(["failure", "insufficient", "unsupported", "cancel"])(
    "%s сохраняет предыдущий черновик",
    (kind) => {
      let s = reduce(generatedSession(), {
        type: "edit-result",
        section: "role",
        text: "Новая роль",
      });
      s = reduce(s, { type: "start", id: "again", kind: "generation" });
      const previous = s.result;
      if (kind === "failure")
        s = reduce(s, { type: "failure", id: "again", text: "Ошибка" });
      else if (kind === "cancel") s = reduce(s, { type: "cancel" });
      else
        s = reduce(s, {
          type: "generated",
          id: "again",
          value: kind === "insufficient" ? "insufficient" : null,
        });
      expect(s.result).toBe(previous);
    },
  );
  test("сводка сохраняет рабочий текст, неполноту и неизвестное", () => {
    let s = reduce(confirmedSession(), {
      type: "edit",
      index: 0,
      text: unknownAnswer,
    });
    expect(summaryText(s)).toContain(unknownAnswer);
    expect(summaryText(s)).toContain("Не подтверждено");
    expect(summaryText(s)).not.toContain(s.id + "\n");
  });
});

describe("честность тестовых данных", () => {
  test("свободный текст не получает чужую оценку или вакансию", () => {
    expect(fixtureEvaluation("Q1", "Нужно проектировать турбины")).toBeNull();
    expect(
      fixtureDraft(["Турбины", ...topics.slice(1).map((t) => t.sample)]),
    ).toBeNull();
    expect(fixtureDraft(Array(4).fill(unknownAnswer))).toBe("insufficient");
  });
  test("схема отклоняет чужую цитату, пропуск, повтор ID и лишнее поле", () => {
    const value = fixtureEvaluation("Q1", topics[0].sample)!;
    expect(() =>
      validateEvaluation(value, "Q1", topics[0].sample),
    ).not.toThrow();
    expect(() => validateEvaluation(value, "Q1", "Чужой текст")).toThrow();
    expect(() =>
      validateEvaluation(
        { ...value, items: value.items.slice(1) },
        "Q1",
        topics[0].sample,
      ),
    ).toThrow();
    expect(() =>
      validateEvaluation(
        { ...value, items: [value.items[0], value.items[0]] },
        "Q1",
        topics[0].sample,
      ),
    ).toThrow();
    expect(() =>
      validateEvaluation({ ...value, extra: true }, "Q1", topics[0].sample),
    ).toThrow();
  });
});

describe("автоматические расшифровки кабинета", () => {
  test("четыре ответа атомарно закрывают темы и переводят сеанс к черновику", () => {
    let state = reduce(initialSession("auto"), { type: "begin" });
    for (let i = 0; i < 4; i++) {
      state = reduce(state, {
        type: "start",
        kind: "transcription",
        id: "voice-" + i,
      });
      state = reduce(state, {
        type: "transcript",
        id: "voice-" + i,
        text: topics[i].sample,
        autoAdvance: true,
      });
      expect(state.active).toBeUndefined();
      expect(state.answers.filter((a) => a.confirmed)).toHaveLength(i + 1);
      expect(state.answers[i].confirmedText).toBe(topics[i].sample);
      expect(state.index).toBe(Math.min(i + 1, 3));
    }
    expect(state.stage).toBe("review");
  });
  test("повторная запись добавляет текст без потери ручной правки", () => {
    let state = reduce(initialSession("auto"), {
      type: "edit",
      index: 0,
      text: "Мой термин",
    });
    state = reduce(state, {
      type: "start",
      kind: "transcription",
      id: "voice",
      append: true,
    });
    state = reduce(state, {
      type: "transcript",
      id: "voice",
      text: "Новые слова",
      autoAdvance: true,
    });
    expect(state.answers[0].text).toBe("Мой термин\nНовые слова");
    expect(state.answers[0].confirmed).toBe(true);
    expect(state.index).toBe(1);
  });
  test("пустая расшифровка не засчитывает уже введённый текст", () => {
    let state = reduce(initialSession("auto"), {
      type: "edit",
      index: 0,
      text: "Моя правка",
    });
    state = reduce(state, {
      type: "start",
      kind: "transcription",
      id: "voice",
      append: true,
    });
    state = reduce(state, {
      type: "transcript",
      id: "voice",
      text: "   ",
      autoAdvance: true,
    });
    expect(state.answers[0].text).toBe("Моя правка");
    expect(state.answers[0].confirmed).toBe(false);
    expect(state.index).toBe(0);
    expect(state.active).toBeUndefined();
  });
  test("поздний результат отменённой записи не закрывает тему", () => {
    let state = reduce(initialSession("auto"), {
      type: "start",
      kind: "transcription",
      id: "voice",
    });
    state = reduce(state, { type: "cancel" });
    expect(
      reduce(state, {
        type: "transcript",
        id: "voice",
        text: "Запоздалые слова",
        autoAdvance: true,
      }),
    ).toBe(state);
  });
  test("слишком длинное дополнение сохраняется целиком и требует сокращения", () => {
    let state = reduce(initialSession("auto"), {
      type: "edit",
      index: 0,
      text: "я".repeat(6000),
    });
    state = reduce(state, {
      type: "start",
      kind: "transcription",
      id: "voice",
      append: true,
    });
    state = reduce(state, {
      type: "transcript",
      id: "voice",
      text: "ещё",
      autoAdvance: true,
    });
    expect(state.answers[0].text).toBe("я".repeat(6000) + "\nещё");
    expect(state.answers[0].confirmed).toBe(false);
    expect(state.index).toBe(0);
    expect(state.active).toBeUndefined();
  });
});
