// Превью показывает сохранённую редакцию и состояние текущей попытки сборки.
import { VacancyDocument } from "./VacancyDocument";
import { vacancyDocumentText } from "./vacancy-document";
import {
  ArrowRight,
  Copy,
  Download,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import { resultStale } from "../../domain/session";
import { downloadText } from "../export";
import type { InterviewSession } from "../interview/useInterviewSession";
import { Button } from "../ui/button";

/** Во время сборки показывает очертания документа, сохраняя доступное действие отмены. */
function DraftLoading({ cancel }: { cancel: () => void }) {
  return (
    <div className="ix-loading">
      <div className="ix-loading-toolbar">
        <div className="ix-loading-status" role="status">
          <span className="ix-loading-symbol" aria-hidden="true">
            <LoaderCircle />
          </span>
          <span>Собираю черновик…</span>
        </div>
        <Button variant="ghost" size="sm" onClick={cancel}>
          Отменить сборку
        </Button>
      </div>
      <div className="ix-loading-document" aria-hidden="true">
        <div className="ix-cover ix-loading-cover">
          <div className="ix-cover-brand">
            <span>✦</span> Искра
          </div>
          <span className="ix-skeleton ix-skeleton-cover-title" />
          <span className="ix-skeleton ix-skeleton-cover-line" />
        </div>
        {[0, 1, 2].map((section) => (
          <div className="ix-loading-section" key={section}>
            <span className="ix-skeleton ix-skeleton-heading" />
            <span className="ix-skeleton" />
            <span className="ix-skeleton" />
            <span className="ix-skeleton ix-skeleton-short" />
          </div>
        ))}
      </div>
    </div>
  );
}

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
          <h2 tabIndex={-1} id="ix-preview-title">
            Черновик вакансии
          </h2>
        </div>
        <div className="ix-actions">
          <Button
            variant="ghost"
            size="icon"
            aria-label="К ответам"
            onClick={back}
          >
            <ArrowRight />
          </Button>
        </div>
      </header>
      <div className="ix-scroll">
        {waiting ? (
          <DraftLoading cancel={back} />
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
            {result && (
              <VacancyDocument
                result={result}
                onChange={(section, text) =>
                  dispatch({ type: "edit-result", section, text })
                }
                onUndo={(section) => dispatch({ type: "undo-result", section })}
              />
            )}
          </>
        )}
      </div>
      <footer className="ix-foot">
        <div className="ix-actions">
          {result && !waiting && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void copy(vacancyDocumentText(state))}
              >
                <Copy />
                Копировать
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  downloadText(vacancyDocumentText(state), "вакансия.txt")
                }
              >
                <Download />
                Скачать .txt
              </Button>
            </>
          )}
        </div>
      </footer>
    </>
  );
}
