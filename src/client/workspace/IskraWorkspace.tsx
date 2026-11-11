// Вход в локальный кабинет и возврат в ту же вакансию после интервью.
import { useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  FolderOpen,
  PanelLeft,
  Pin,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "@/client/ui/button";
import { Input } from "@/client/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/client/ui/select";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from "@/client/ui/sidebar";
import { vacancies } from "@/domain/workspace-fixtures";
import {
  filterVacancies,
  rubles,
  type Vacancy,
  type VacancyStatus,
} from "@/domain/workspace";
import { VacancyComposer } from "./VacancyComposer";
import { VacancyDashboard } from "./VacancyDashboard";
import "./theme.css";
import "./workspace.css";

type Filter = VacancyStatus | "all";
const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "Все статусы" },
  { value: "active", label: "Активные" },
  { value: "paused", label: "Приостановленные" },
  { value: "draft", label: "Черновики" },
];

/** Кнопка боковой панели сохраняет один доступный способ открыть список на телефоне. */
function MenuButton() {
  const { toggleSidebar, isMobile, openMobile, open } = useSidebar();
  const expanded = isMobile ? openMobile : open;
  return (
    <Button
      id="isk-menu"
      variant="ghost"
      size="icon-sm"
      aria-expanded={expanded}
      aria-label={
        expanded ? "Скрыть список вакансий" : "Открыть список вакансий"
      }
      onClick={toggleSidebar}
    >
      <PanelLeft />
    </Button>
  );
}

/** Выбранная вакансия, поиск и действие создания доступны в одном меню на любом экране. */
function VacancyMenu({
  visible,
  selected,
  query,
  status,
  onQuery,
  onStatus,
  onSelect,
  onAdd,
}: {
  visible: Vacancy[];
  selected?: string;
  query: string;
  status: Filter;
  onQuery: (s: string) => void;
  onStatus: (s: Filter) => void;
  onSelect: (v: string) => void;
  onAdd: () => void;
}) {
  const { setOpenMobile, isMobile } = useSidebar();
  // Скрываем мобильное меню после выбора, чтобы стала видна карточка вакансии.
  function select(id: string) {
    onSelect(id);
    setOpenMobile(false);
  }
  const groups = [
    { name: "Закреплённые", items: visible.filter((v) => v.pinned) },
    ...["Разработка", "Аналитика", "Дизайн", "Продукт"].map((name) => ({
      name,
      items: visible.filter((v) => !v.pinned && v.group === name),
    })),
  ];
  return (
    <Sidebar>
      <SidebarHeader className="isk-side-head">
        <div className="isk-identity">
          <div className="isk-logo" aria-hidden="true">
            ✦
          </div>
          <div>
            <strong>Искра</strong>
            <small>Команда найма</small>
          </div>
          {isMobile && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setOpenMobile(false)}
              aria-label="Закрыть список"
            >
              <X />
            </Button>
          )}
        </div>
        <div className="isk-find">
          <Search />
          <Input
            aria-label="Поиск вакансий"
            placeholder="Поиск вакансий"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
          />
        </div>
        <Select
          value={status}
          onValueChange={(value) => onStatus(value as Filter)}
        >
          <SelectTrigger className="isk-filter" aria-label="Статус вакансий">
            <SlidersHorizontal aria-hidden="true" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            className="isk-status-popup"
            position="popper"
            align="start"
          >
            {filters.map((filter) => (
              <SelectItem key={filter.value} value={filter.value}>
                {filter.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SidebarHeader>
      <SidebarContent className="isk-side-body">
        <nav aria-label="Вакансии">
          {!visible.length && isMobile && (
            <div className="isk-no-matches">
              <p>Вакансии не найдены</p>
              <Button
                variant="outline"
                onClick={() => {
                  onQuery("");
                  onStatus("all");
                }}
              >
                Сбросить фильтры
              </Button>
            </div>
          )}
          {groups
            .filter((g) => g.items.length)
            .map((group) => (
              <div className="isk-group" key={group.name}>
                <h2>
                  {group.name === "Закреплённые" && <Pin />}
                  {group.name}
                  <span>{group.items.length}</span>
                </h2>
                {group.items.map((v) => (
                  <Button
                    key={v.id}
                    variant="ghost"
                    className="isk-job"
                    aria-current={selected === v.id ? "page" : undefined}
                    onClick={() => select(v.id)}
                  >
                    <span>
                      <strong>{v.title}</strong>
                      <small>
                        {v.salaryFrom === null
                          ? "Зарплата не указана"
                          : "От " + rubles(v.salaryFrom)}
                      </small>
                    </span>
                    <span className="isk-dot" data-status={v.status} />
                  </Button>
                ))}
              </div>
            ))}
        </nav>
      </SidebarContent>
      <SidebarFooter className="isk-side-foot">
        <Button
          id="isk-add"
          onClick={() => {
            setOpenMobile(false);
            onAdd();
          }}
        >
          <Plus />
          Добавить вакансию
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

/** Сохраняет фильтры и выбранную вакансию при возврате из интервью. */
export function IskraWorkspace() {
  const [screen, setScreen] = useState<"workspace" | "interview">("workspace");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Filter>("all");
  const [selected, setSelected] = useState(vacancies[0].id);
  const restore = useRef(false);
  const visible = filterVacancies(vacancies, query, status);
  const current = visible.find((v) => v.id === selected) ?? visible[0];
  useEffect(() => {
    if (screen === "workspace" && restore.current) {
      restore.current = false;
      const target = document.getElementById(
        matchMedia("(min-width: 768px)").matches ? "isk-add" : "isk-menu",
      );
      target?.focus();
    }
    document.title =
      screen === "interview" ? "Создание вакансии · Искра" : "Вакансии · Искра";
  }, [screen]);
  // После подтверждённого выхода интервью размонтируется и освобождает свои операции.
  function back() {
    restore.current = true;
    setScreen("workspace");
  }
  return (
    <SidebarProvider className="isk-shell">
      <VacancyMenu
        visible={visible}
        selected={current?.id}
        query={query}
        status={status}
        onQuery={setQuery}
        onStatus={setStatus}
        onSelect={(v) => {
          setSelected(v);
          setScreen("workspace");
        }}
        onAdd={() => setScreen("interview")}
      />
      <SidebarInset className="isk-main">
        <div className="isk-topbar">
          <div>
            <MenuButton />
            <span className="isk-crumb">Кабинет</span>
            <ChevronRight />
            <strong>Вакансии</strong>
          </div>
        </div>
        {current ? (
          <VacancyDashboard key={current.id} vacancy={current} />
        ) : (
          <div className="isk-empty">
            <FolderOpen />
            <h1>Вакансии не найдены</h1>
            <p>Попробуйте другой запрос или статус.</p>
            <Button
              variant="outline"
              onClick={() => {
                setQuery("");
                setStatus("all");
              }}
            >
              Сбросить фильтры
            </Button>
          </div>
        )}
      </SidebarInset>
      {screen === "interview" && <VacancyComposer onExit={back} />}
    </SidebarProvider>
  );
}
