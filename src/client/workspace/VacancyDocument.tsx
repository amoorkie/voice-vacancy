// Читатель видит готовый текст вакансии, а источники открывает отдельно по необходимости.
import { sectionIds, sectionNames } from "../../contracts/interview";
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

/** Выводит заголовки, абзацы и списки семантической разметкой. Любой ввод остаётся текстом. */
export function VacancyDocument({ result }: { result: Result }) {
  const doc = vacancyDocument(result);
  return (
    <>
      <article className="ix-document">
        <h3>{doc.title}</h3>
        {doc.intro.map((s, i) => (
          <p key={i}>{s}</p>
        ))}
        {doc.sections
          .filter((s) => s.body.length)
          .map((s) => (
            <section key={s.id} data-section={s.id}>
              <h4>{s.title}</h4>
              {s.list ? (
                <ul>
                  {s.body.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              ) : (
                s.body.map((line, i) => <p key={i}>{line}</p>)
              )}
            </section>
          ))}
      </article>
      <Sources result={result} />
    </>
  );
}
