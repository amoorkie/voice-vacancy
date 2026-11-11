// Вымышленные данные для проверки интерфейса. Здесь нет вызова модели или анализа свободного текста.
import {
  type Draft,
  type Evaluation,
  type TopicId,
} from "../contracts/interview";
export const topics = [
  {
    id: "Q1",
    short: "Задачи",
    title: "Какие две-три задачи сотрудник будет выполнять каждый день?",
    hint: "Расскажите, что человек будет делать и какой результат вы ждёте.",
    sample:
      "Сотрудник разбирает обращения клиентов и обновляет базу знаний, чтобы клиенты быстрее решали свои вопросы.",
  },
  {
    id: "Q2",
    short: "Первое полугодие",
    title: "Над каким проектом сотрудник будет работать первые шесть месяцев?",
    hint: "Можно описать проект или регулярную работу. Уточните вклад сотрудника.",
    sample:
      "В первые шесть месяцев сотрудник помогает запустить службу поддержки: готовит инструкции и отвечает на обращения.",
  },
  {
    id: "Q3",
    short: "Дальнейший фокус",
    title:
      "Что изменится в следующие полгода: продолжение проекта или другой фокус?",
    hint: "Если работа останется прежней, так и скажите. Неопределённый план тоже можно отметить.",
    sample: "Продолжит ту же работу без изменений.",
  },
  {
    id: "Q4",
    short: "Инструменты и знания",
    title:
      "Какие инструменты и знания нужны для этих задач? Что обязательно, а что желательно?",
    hint: "Свяжите навыки с задачами. Отделите обязательное от желательного.",
    sample:
      "Обязательно уметь работать с обращениями в CRM. SQL желателен для проверки данных отчёта.",
  },
] satisfies {
  id: TopicId;
  short: string;
  title: string;
  hint: string;
  sample: string;
}[];
export const vagueAnswer = "Нужен хороший специалист, чтобы всё было хорошо.";
export const unknownAnswer = "Пока не знаю";
// Ответы демонстрационного интервью в кабинете не зависят от выбранной фоновой вакансии.
export const workspaceSamples = [
  "Frontend-разработчик создаёт формы кабинета, исправляет ошибки по обращениям и покрывает изменения тестами.",
  "В первые полгода выпустит кабинет работодателя и подключит интерфейс к готовому API.",
  "Продолжит развивать кабинет. Задачи по аналитике пока обсуждаются.",
  "Обязательны React, TypeScript и умение делать доступные формы. Опыт с Playwright желателен.",
];
export const conflictingSkills =
  "Playwright обязателен. В команде говорят, что Playwright можно не знать.";
export const followUpAnswer = topics[0].sample;

/** Возвращает оценку только для известной фикстуры; свободный текст не оценивается. */
export function fixtureEvaluation(
  question: TopicId,
  text: string,
): Evaluation | null {
  const index = topics.findIndex((topic) => topic.id === question);
  const sample = topics[index].sample;
  const workspaceSample = workspaceSamples[index];
  const conflict = question === "Q4" && text === conflictingSkills;
  const present =
    text === workspaceSample ||
    text === sample ||
    (question === "Q1" && text === `${vagueAnswer}\n${followUpAnswer}`);
  const unknown = text === unknownAnswer;
  const vague = question === "Q1" && text === vagueAnswer;
  if (!present && !unknown && !vague && !conflict) return null;
  return {
    kind: "fixture",
    items: Array.from({ length: question === "Q4" ? 3 : 2 }, (_, index) => ({
      slotId: `${question}.${index + 1}`,
      status: present
        ? ("present" as const)
        : unknown
          ? ("explicitly_unknown" as const)
          : ("missing" as const),
      evidence:
        vague || conflict
          ? []
          : [
              unknown
                ? unknownAnswer
                : text === workspaceSample
                  ? workspaceSample
                  : sample,
            ],
    })),
    ...(vague
      ? {
          followUp:
            "Какие конкретные действия сотрудник будет выполнять и ради какого результата?",
        }
      : {}),
    ...(conflict
      ? {
          conflicts: [
            {
              slotIds: ["Q4.1"],
              evidence: [
                "Playwright обязателен.",
                "Playwright можно не знать.",
              ],
            },
          ],
          followUp: "Опыт с Playwright обязателен или желателен?",
        }
      : {}),
  };
}

/** Даёт шесть разделов лишь для известного набора; не сочиняет факты для произвольного ввода. */
export function fixtureDraft(texts: string[]): Draft | "insufficient" | null {
  if (texts.every((text) => text === unknownAnswer)) return "insufficient";
  if (
    texts.length === 4 &&
    texts.every(
      (text, i) =>
        text === workspaceSamples[i] ||
        text === unknownAnswer ||
        (i === 3 && text === conflictingSkills),
    )
  ) {
    if (texts[0] === unknownAnswer && texts[1] === unknownAnswer)
      return "insufficient";
    const roleKnown = texts[0] === workspaceSamples[0];
    const questions = [
      roleKnown
        ? "Нужно уточнить условия работы и зарплату."
        : "Уточнить название роли, условия работы и зарплату.",
    ];
    const references = topics
      .filter(
        (_, i) =>
          texts[i] === unknownAnswer ||
          i === 2 ||
          texts[i] === conflictingSkills,
      )
      .map((t) => t.id);
    texts.forEach((value, i) => {
      if (value === unknownAnswer)
        questions.push("Уточнить тему «" + topics[i].short + "».");
    });
    if (texts[2] === workspaceSamples[2])
      questions.push("Определить задачи по аналитике.");
    if (texts[3] === conflictingSkills)
      questions.push("Согласовать, обязателен ли Playwright.");
    return {
      sections: {
        role: roleKnown
          ? "Frontend-разработчик. Условия работы ещё не указаны."
          : "Название роли и условия работы пока не указаны.",
        tasks: texts[0],
        "first-half": texts[1],
        "next-half": texts[2],
        skills:
          texts[3] === conflictingSkills
            ? "Требования к Playwright расходятся."
            : texts[3],
        clarifications: questions.join(" "),
      },
      sources: {
        ...(roleKnown ? { role: ["Q1" as const] } : {}),
        clarifications: references,
        tasks: ["Q1"],
        "first-half": ["Q2"],
        "next-half": ["Q3"],
        skills: ["Q4"],
      },
    };
  }
  const q1 =
    texts[0] === topics[0].sample ||
    texts[0] === `${vagueAnswer}\n${followUpAnswer}`;
  if (
    !q1 ||
    !texts
      .slice(1)
      .every(
        (text, i) => text === topics[i + 1].sample || text === unknownAnswer,
      )
  )
    return null;
  return {
    sections: {
      role: "Название роли нужно уточнить. Условия работы пока не указаны.",
      tasks: topics[0].sample,
      "first-half": texts[1],
      "next-half": texts[2],
      skills: texts[3],
      clarifications:
        "Нужно уточнить название роли и условия работы." +
        (texts.includes(unknownAnswer)
          ? " Часть ответов пока неизвестна."
          : ""),
    },
    sources: {
      tasks: ["Q1"],
      "first-half": ["Q2"],
      "next-half": ["Q3"],
      skills: ["Q4"],
    },
  };
}
