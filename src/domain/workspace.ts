// Вакансии и отклики демо. Все представления используют одну выборку по вакансии.
export type VacancyStatus = "active" | "paused" | "draft";
export type Vacancy = {
  id: string;
  title: string;
  group: string;
  city: string;
  format: string;
  status: VacancyStatus;
  pinned: boolean;
  salaryFrom: number | null;
};
export type Application = {
  id: string;
  vacancyId: string;
  displayName: string;
  replied: boolean;
  testPassed: boolean;
  score: number | null;
  salaryExpectation: number | null;
  experienceYears: number | null;
};

export const statusLabels: Record<VacancyStatus, string> = {
  active: "Активна",
  paused: "Приостановлена",
  draft: "Черновик",
};

/** Ищет должность, команду или город в пределах выбранного статуса. */
export function filterVacancies(
  all: Vacancy[],
  query: string,
  status: VacancyStatus | "all",
) {
  const term = query.trim().toLocaleLowerCase("ru");
  return all.filter(
    (v) =>
      (status === "all" || v.status === status) &&
      [v.title, v.group, v.city].some((field) =>
        field.toLocaleLowerCase("ru").includes(term),
      ),
  );
}

// Нижние границы включены. Последняя группа содержит все бо́льшие значения.
export const salaryBands = [0, 150000, 180000, 210000, 240000, 270000];
export const scoreBands = [0, 50, 60, 70, 80, 90];

/** Вычисляет топ и распределение, отдельно учитывая отклики без зарплаты или оценки. */
export function vacancyStats(all: Application[], vacancyId: string) {
  const applications = all.filter((a) => a.vacancyId === vacancyId);
  const rated = applications
    .filter((a) => a.score !== null)
    .sort((a, b) => b.score! - a.score! || a.id.localeCompare(b.id));
  const heat = salaryBands.map(() => scoreBands.map(() => 0));
  let excluded = 0;
  for (const a of applications) {
    if (a.salaryExpectation === null || a.score === null) {
      excluded++;
      continue;
    }
    const row = salaryBands.findLastIndex((low) => a.salaryExpectation! >= low);
    const col = scoreBands.findLastIndex((low) => a.score! >= low);
    heat[row][col]++;
  }
  return {
    applications,
    top: rated.slice(0, 5),
    heat,
    excluded,
    replied: applications.filter((a) => a.replied).length,
    passed: applications.filter((a) => a.testPassed).length,
  };
}

/** Форматирует денежные значения для русскоязычного кабинета. */
export function rubles(value: number | null) {
  return value === null
    ? "Не указана"
    : new Intl.NumberFormat("ru-RU").format(value) + " ₽";
}
