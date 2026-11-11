// Карточки кандидатов, таблица и тепловая карта вычисляются по одной выбранной вакансии.
import { useEffect, useRef, useState } from "react";
import {
  BriefcaseBusiness,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  MapPin,
  MessageSquare,
  Users,
} from "lucide-react";
import { Badge } from "@/client/ui/badge";
import { Button } from "@/client/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/ui/table";
import { applications } from "@/domain/workspace-fixtures";
import {
  rubles,
  statusLabels,
  vacancyStats,
  scoreBands,
  salaryBands,
  type Application,
  type Vacancy,
} from "@/domain/workspace";

const salaryLabels = [
  "До 150",
  "150–179",
  "180–209",
  "210–239",
  "240–269",
  "270 и выше",
];
const scoreLabels = ["0–49", "50–59", "60–69", "70–79", "80–89", "90–100"];
const yearsFormat = new Intl.PluralRules("ru");
/** Сохраняет различие между отсутствующим опытом и нулевым стажем. */
function experience(years: number | null) {
  if (years === null) return "Не указан";
  const form = yearsFormat.select(years);
  return (
    years + " " + (form === "one" ? "год" : form === "few" ? "года" : "лет")
  );
}
/** Этап отражает самое позднее из двух действий кандидата. */
function stage(a: Application) {
  return a.testPassed ? "Тест пройден" : a.replied ? "Ответил" : "Новый отклик";
}

/** Даёт переключаться между пятью лучшими и полным списком по этой же вакансии. */
function CandidateList({ stats }: { stats: ReturnType<typeof vacancyStats> }) {
  const [all, setAll] = useState(false);
  const [position, setPosition] = useState({ start: true, end: false });
  const track = useRef<HTMLDivElement>(null);
  // При смене вкладки и размера окна заново проверяю доступность стрелок.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const measure = () =>
      setPosition({
        start: el.scrollLeft < 2,
        end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2,
      });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    el.addEventListener("scroll", measure, { passive: true });
    measure();
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [all]);
  const scroll = (direction: number) => {
    const el = track.current;
    if (el)
      el.scrollBy({
        left:
          direction * ((el.firstElementChild as HTMLElement).offsetWidth + 12),
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  };
  return (
    <section aria-label="Кандидаты" className="isk-section">
      <div className="isk-section-head">
        <div
          className="isk-switch"
          role="group"
          aria-label="Представление откликов"
        >
          <Button
            variant="ghost"
            aria-pressed={!all}
            onClick={() => setAll(false)}
          >
            Топ кандидатов
          </Button>
          <Button
            variant="ghost"
            aria-pressed={all}
            onClick={() => setAll(true)}
          >
            Все отклики <span>{stats.applications.length}</span>
          </Button>
        </div>
        {!all && !(position.start && position.end) && (
          <div className="isk-pager">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Предыдущие кандидаты"
              disabled={position.start}
              onClick={() => scroll(-1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Следующие кандидаты"
              disabled={position.end}
              onClick={() => scroll(1)}
            >
              <ChevronRight />
            </Button>
          </div>
        )}
      </div>
      {all ? (
        <Table className="isk-table">
          <TableHeader>
            <TableRow>
              {["Кандидат", "Скор", "Ожидания", "Опыт", "Статус"].map((h) => (
                <TableHead key={h}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.applications.map((a) => (
              <TableRow key={a.id}>
                <TableCell>{a.displayName}</TableCell>
                <TableCell>{a.score ?? "—"}</TableCell>
                <TableCell>{rubles(a.salaryExpectation)}</TableCell>
                <TableCell>{experience(a.experienceYears)}</TableCell>
                <TableCell>{stage(a)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div
          className="isk-track"
          ref={track}
          tabIndex={0}
          role="region"
          aria-label="Лучшие кандидаты по скору"
        >
          {stats.top.map((a, i) => (
            <article key={a.id} className="isk-card">
              <div className="isk-card-head">
                <span className="isk-rank">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3>{a.displayName}</h3>
                  <small>{stage(a)}</small>
                </div>
                <span className="isk-score">
                  {a.score}
                  <small>скор</small>
                </span>
              </div>
              <dl>
                <div>
                  <dt>Ожидания по зарплате</dt>
                  <dd>{rubles(a.salaryExpectation)}</dd>
                </div>
                <div>
                  <dt>Опыт работы</dt>
                  <dd>{experience(a.experienceYears)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/** Показывает число откликов на пересечении зарплаты и оценки. Неполные данные указаны под таблицей. */
function Heatmap({ stats }: { stats: ReturnType<typeof vacancyStats> }) {
  return (
    <section
      className="isk-section isk-analysis"
      aria-labelledby="analysis-title"
    >
      <div className="isk-section-head">
        <div>
          <h2 id="analysis-title">Анализ откликов</h2>
          <p>Ожидания по зарплате и скор кандидатов</p>
        </div>
        <span className="isk-count">
          {stats.applications.length - stats.excluded} в сравнении
        </span>
      </div>
      <div className="isk-heat-scroll">
        <table
          className="isk-heat"
          aria-label="Распределение откликов по зарплате и скору"
        >
          <thead>
            <tr>
              <th scope="col">тыс. ₽ / скор</th>
              {scoreBands.map((low, col) => (
                <th scope="col" key={low}>
                  {scoreLabels[col]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {salaryBands.map((low, row) => (
              <tr key={low}>
                <th scope="row">{salaryLabels[row]}</th>
                {stats.heat[row].map((count, col) => (
                  <td key={col} data-filled={count > 0} data-band={col}>
                    {count || <span aria-label="0">·</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {stats.excluded > 0 && (
        <p className="isk-heat-note">
          Без зарплаты или скора — {stats.excluded}
        </p>
      )}
    </section>
  );
}

/** Перестраивает сводку и детали на основе выбранной в боковой панели вакансии. */
export function VacancyDashboard({ vacancy }: { vacancy: Vacancy }) {
  const stats = vacancyStats(applications, vacancy.id);
  return (
    <div className="isk-page">
      <header className="isk-job-head">
        <div className="isk-job-label">
          <span>{vacancy.group}</span>
          <Badge
            variant="secondary"
            className="isk-status"
            data-status={vacancy.status}
          >
            <i />
            {statusLabels[vacancy.status]}
          </Badge>
        </div>
        <h1>{vacancy.title}</h1>
        <div className="isk-meta">
          <span>
            <MapPin />
            {vacancy.city}
          </span>
          <span>
            <BriefcaseBusiness />
            {vacancy.format}
          </span>
          {vacancy.salaryFrom !== null && (
            <span>
              <CircleDollarSign />
              От {rubles(vacancy.salaryFrom)}
            </span>
          )}
        </div>
      </header>
      <div className="isk-kpis" aria-label="Показатели вакансии">
        {[
          {
            icon: Users,
            label: "Всего откликов",
            value: stats.applications.length,
          },
          { icon: MessageSquare, label: "Ответили", value: stats.replied },
          { icon: CheckCheck, label: "Прошли тест", value: stats.passed },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label}>
            <span>
              <Icon />
              {label}
            </span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      {stats.applications.length ? (
        <>
          <CandidateList stats={stats} />
          <Heatmap stats={stats} />
        </>
      ) : (
        <div className="isk-empty">
          <Users />
          <h2>Откликов пока нет</h2>
          <p>Здесь появятся кандидаты по этой вакансии.</p>
        </div>
      )}
    </div>
  );
}
