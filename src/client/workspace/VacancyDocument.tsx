// Читатель видит готовый текст вакансии, а источники открывает отдельно по необходимости.
import { RotateCcw } from "lucide-react";
import { Textarea } from "../ui/textarea";
import { Button } from "../ui/button";
import { EditableList } from "./EditableList";
import {
  sectionIds,
  sectionNames,
  type SectionId,
} from "../../contracts/interview";
import { topics } from "../../domain/fixtures";
import type { Result } from "../../domain/session";
import { vacancyDocument } from "./vacancy-document";

/** Показывает источники исходной генерации даже после ручного изменения раздела. */
function Sources({ result }: { result: Result }) {
  return (
    <details className="ix-sources">
      <summary>Источники черновика</summary>
      {sectionIds.map((id) => {
        const claims = result.generated.claims?.[id];
        const refs = result.generated.sources[id] ?? [];
        if (!claims?.length && !refs.length) return null;
        return (
          <section key={id}>
            <h4>
              {sectionNames[id]}
              {result.edits[id] !== undefined ? " · изменено вручную" : ""}
            </h4>
            {claims?.length
              ? claims.map((c) => (
                  <div key={c.id}>
                    <strong>{c.text}</strong>
                    {c.sourceRefs.map((ref, i) => (
                      <blockquote key={i}>
                        {ref.questionId} · {ref.quote}
                      </blockquote>
                    ))}
                    {c.reason === "not-mentioned" && (
                      <p>В ответах не указано.</p>
                    )}
                  </div>
                ))
              : refs.map((source) => {
                  const i = topics.findIndex((t) => t.id === source);
                  return (
                    <blockquote key={source}>
                      {topics[i].short} · {result.sourceTexts[i]}
                    </blockquote>
                  );
                })}
          </section>
        );
      })}
    </details>
  );
}

type Props = {
  result: Result;
  onChange: (section: SectionId, text: string) => void;
  onUndo: (section: SectionId) => void;
};

/** Одна редакция питает поля внутри статьи, копирование и скачивание. */
export function VacancyDocument({ result, onChange, onUndo }: Props) {
  const doc = vacancyDocument(result);
  /** Первая строка раздела хранит заголовок, остальные — условия. Пустое название тоже сохраняется. */
  function editRole(title: string, conditions: string) {
    onChange("role", title.replace(/[\r\n]+/g, " ") + "\n" + conditions);
  }
  /** Отмена относится только к текущему разделу и возвращает курсор в его текст. */
  function undoButton(id: SectionId) {
    if (result.edits[id] === undefined) return null;
    const label = "Вернуть исходный текст: " + sectionNames[id];
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        className="ix-undo"
        title={label}
        aria-label={label}
        onClick={(event) => {
          event.currentTarget
            .closest("[data-section]")
            ?.querySelector("textarea")
            ?.focus();
          onUndo(id);
        }}
      >
        <RotateCcw />
      </Button>
    );
  }
  return (
    <>
      <article className="ix-document" aria-label="Текст вакансии">
        <header className="ix-cover" data-section="role">
          <div className="ix-cover-brand">
            <span aria-hidden="true">✦</span> Искра
          </div>
          {undoButton("role")}
          <h3 aria-label={doc.title || "Вакансия"}>
            <Textarea
              className="ix-inline-text ix-role-title"
              aria-label="Название вакансии"
              placeholder="Название вакансии"
              rows={1}
              value={doc.title}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  event.currentTarget
                    .closest("header")
                    ?.querySelector<HTMLTextAreaElement>(".ix-role-conditions")
                    ?.focus();
                }
              }}
              onChange={(e) => editRole(e.currentTarget.value, doc.conditions)}
            />
          </h3>
          <Textarea
            className="ix-inline-text ix-role-conditions"
            aria-label="Условия работы"
            placeholder="Добавить условия"
            rows={1}
            value={doc.conditions}
            onChange={(e) => editRole(doc.title, e.currentTarget.value)}
          />
        </header>
        {doc.sections.map((s) => (
          <section key={s.id} data-section={s.id}>
            <div className="ix-section-title">
              <h4>{s.title}</h4>
              {undoButton(s.id)}
            </div>
            {s.list ? (
              <EditableList
                label={s.title}
                value={s.body}
                onChange={(text) => onChange(s.id, text)}
              />
            ) : (
              <Textarea
                className="ix-inline-text"
                rows={1}
                aria-label={s.title}
                placeholder="Добавить текст"
                value={s.body}
                onChange={(e) => onChange(s.id, e.currentTarget.value)}
              />
            )}
          </section>
        ))}
      </article>
      <Sources result={result} />
    </>
  );
}
