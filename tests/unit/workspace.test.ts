// Проверки фикстур, фильтров и пограничных значений аналитики кабинета.
import { expect, test } from "vitest";
import { vacancies, applications } from "../../src/domain/workspace-fixtures";
import { filterVacancies, vacancyStats } from "../../src/domain/workspace";

test("показываю только отклики выбранной вакансии, согласованные статусы и показатели", () => {
  expect(new Set(vacancies.map((v) => v.id)).size).toBe(6);
  expect(new Set(applications.map((a) => a.id)).size).toBe(applications.length);
  expect(
    applications.every(
      (a) =>
        vacancies.some((v) => v.id === a.vacancyId) &&
        (!a.testPassed || a.replied),
    ),
  ).toBe(true);
  expect(vacancies.filter((v) => v.pinned)).toHaveLength(2);
  expect(vacancies.filter((v) => v.status === "active")).toHaveLength(4);
  expect(vacancies.filter((v) => v.status === "paused")).toHaveLength(1);
  expect(
    filterVacancies(vacancies, " мосКВА ", "draft").map((v) => v.id),
  ).toEqual(["manager"]);
  const stats = vacancyStats(applications, "front");
  expect([stats.applications.length, stats.replied, stats.passed]).toEqual([
    12, 8, 5,
  ]);
  expect(stats.top.map((a) => a.score)).toEqual([97, 96, 92, 88, 85]);
  expect(stats.heat.flat().reduce((a, b) => a + b, 0) + stats.excluded).toBe(
    12,
  );
  expect(vacancyStats(applications, "manager").applications).toEqual([]);
});
test("нижняя граница попадает в следующую ячейку, отсутствие данных отличается от нуля", () => {
  const rows = [
    [149999, 49],
    [150000, 50],
    [270000, 100],
    [null, 0],
    [0, null],
    [0, 0],
  ].map(([salaryExpectation, score], i) => ({
    ...applications[0],
    id: String(i),
    salaryExpectation,
    score,
  }));
  const { heat, excluded, top } = vacancyStats(rows, "front");
  expect(heat[0][0]).toBe(2);
  expect(heat[1][1]).toBe(1);
  expect(heat.at(-1)!.at(-1)).toBe(1);
  expect(excluded).toBe(2);
  expect(top.map((a) => a.score)).toEqual([100, 50, 49, 0, 0]);
});
