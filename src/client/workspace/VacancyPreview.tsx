// Редактор показывает сохранённую редакцию, её источники и состояние текущей попытки сборки.
import { ArrowRight, Copy, Download, RotateCcw } from "lucide-react";
import { sectionIds, sectionNames } from "../../contracts/interview";
import { topics } from "../../domain/fixtures";
import { resultStale } from "../../domain/session";
import { downloadText, summaryText, vacancyText } from "../export";
import type { InterviewSession } from "../interview/useInterviewSession";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

/** Изменения шести полей и экспорт читают одну редакцию результата. */
export function VacancyPreview({
  session,
  back,
  generate,
}: {
  session: InterviewSession;
  back: () => void;
  generate: () => void;
}) {
  const { state, dispatch, copy } = session;
  const result = state.result;
  const waiting = state.active?.kind === "generation";
  const stale = !!result && resultStale(state);
  return (
    <>
      <header className="ix-head">
        <div className="ix-titles">
          <span className="ix-eyebrow">
            <i />
            Искра · Превью
          </span>
          <h2 tabIndex={-1} id="ix-preview-title">
            Черновик вакансии
          </h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="К ответам"
          onClick={back}
        >
          <ArrowRight />
        </Button>
      </header>
      <div className="ix-scroll" aria-busy={waiting}>
        {waiting ? (
          <div className="ix-notice" role="status">
            <strong>Собираю черновик…</strong>
            <p>Использую четыре подтверждённых ответа.</p>
            <Button variant="outline" onClick={back}>
              Отменить сборку
            </Button>
          </div>
        ) : (
          <>
            {state.message && (
              <p role="status" className="ix-feedback">
                {state.message}
              </p>
            )}
            {stale && (
              <div className="ix-notice">
                <strong>Ответы изменились</strong>
                <p>В этой редакции ещё прежние ответы.</p>
              </div>
            )}
            {(stale || (!result && state.message)) && (
              <Button
                variant="outline"
                disabled={!state.answers.every((a) => a.confirmed)}
                onClick={generate}
              >
                <RotateCcw />
                {result ? "Пересобрать черновик" : "Попробовать снова"}
              </Button>
            )}
            {result &&
              sectionIds.map((id) => (
                <section className="ix-section" key={id}>
                  <div className="ix-label">
                    <label htmlFor={"ix-" + id}>{sectionNames[id]}</label>
                    {result.edits[id] !== undefined && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          dispatch({ type: "undo-result", section: id })
                        }
                      >
                        Отменить правку
                      </Button>
                    )}
                  </div>
                  <Textarea
                    id={"ix-" + id}
                    value={result.edits[id] ?? result.generated.sections[id]}
                    onChange={(e) =>
                      dispatch({
                        type: "edit-result",
                        section: id,
                        text: e.target.value,
                      })
                    }
                  />
                  {result.generated.sources[id]?.length && (
                    <details>
                      <summary>Исходный ответ</summary>
                      {result.generated.sources[id]?.map((source) => {
                        const i = topics.findIndex((t) => t.id === source);
                        return (
                          <blockquote key={source}>
                            <strong>{topics[i].short}</strong>{" "}
                            {result.sourceTexts[i]}
                          </blockquote>
                        );
                      })}
                    </details>
                  )}
                </section>
              ))}
          </>
        )}
      </div>
      <footer className="ix-foot">
        <Button variant="ghost" size="sm" onClick={back}>
          <ArrowRight />К интервью
        </Button>
        <div className="ix-actions">
          {result && !waiting ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void copy(vacancyText(state))}
              >
                <Copy />
                Копировать
              </Button>
              <Button
                size="sm"
                onClick={() => downloadText(vacancyText(state), "вакансия.txt")}
              >
                <Download />
                Скачать .txt
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadText(summaryText(state), "сводка.txt")}
            >
              <Download />
              Сводка .txt
            </Button>
          )}
        </div>
      </footer>
    </>
  );
}
