// Синтетический кабинет: идентификаторы кандидатов обезличены, условия заданы для каждой роли.
import type { Application, Vacancy } from "./workspace";
export const vacancies: Vacancy[] = [
  {
    id: "front",
    title: "Frontend Engineer",
    group: "Разработка",
    city: "Екатеринбург",
    format: "Гибрид",
    status: "active",
    pinned: true,
    salaryFrom: 160000,
  },
  {
    id: "design",
    title: "Продуктовый дизайнер",
    group: "Дизайн",
    city: "Москва",
    format: "Удалённо",
    status: "active",
    pinned: true,
    salaryFrom: 180000,
  },
  {
    id: "back",
    title: "Backend Engineer",
    group: "Разработка",
    city: "Казань",
    format: "Удалённо",
    status: "active",
    pinned: false,
    salaryFrom: 200000,
  },
  {
    id: "analytics",
    title: "Продуктовый аналитик",
    group: "Аналитика",
    city: "Москва",
    format: "Гибрид",
    status: "active",
    pinned: false,
    salaryFrom: 170000,
  },
  {
    id: "qa",
    title: "QA Engineer",
    group: "Разработка",
    city: "Екатеринбург",
    format: "Офис",
    status: "paused",
    pinned: false,
    salaryFrom: 130000,
  },
  {
    id: "manager",
    title: "Менеджер продукта",
    group: "Продукт",
    city: "Москва",
    format: "Гибрид",
    status: "draft",
    pinned: false,
    salaryFrom: null,
  },
];

type Sample = [
  score: number | null,
  salary: number | null,
  years: number | null,
  stage: "new" | "replied" | "passed",
];
/** Связывает короткие записи с вакансией. Пройденный тест всегда подразумевает ответ. */
function responses(vacancyId: string, samples: Sample[]): Application[] {
  return samples.map(
    ([score, salaryExpectation, experienceYears, stage], i) => ({
      id: vacancyId + "-" + (i + 1),
      vacancyId,
      displayName: "Кандидат " + String(i + 1).padStart(2, "0"),
      score,
      salaryExpectation,
      experienceYears,
      replied: stage !== "new",
      testPassed: stage === "passed",
    }),
  );
}
export const applications: Application[] = [
  ...responses("front", [
    [97, 160000, 3, "passed"],
    [96, null, 5, "passed"],
    [92, 220000, 8, "passed"],
    [88, 190000, 4, "passed"],
    [85, 175000, 3, "passed"],
    [78, 160000, 2, "replied"],
    [72, 185000, 4, "replied"],
    [66, 230000, 5, "replied"],
    [58, 150000, 1, "new"],
    [45, 145000, 2, "new"],
    [null, 210000, null, "new"],
    [64, 275000, 6, "new"],
  ]),
  ...responses("design", [
    [95, 200000, 5, "passed"],
    [83, 180000, 3, "replied"],
    [76, 160000, 2, "new"],
    [null, null, 1, "new"],
  ]),
  ...responses("back", [
    [89, 240000, 6, "passed"],
    [75, 200000, 3, "replied"],
    [62, 190000, 2, "new"],
  ]),
  ...responses("analytics", [
    [94, 180000, 4, "passed"],
    [80, 175000, 3, "replied"],
  ]),
  ...responses("qa", [[68, 135000, 2, "replied"]]),
];
