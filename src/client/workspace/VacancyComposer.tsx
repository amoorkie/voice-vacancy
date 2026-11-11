// Один модальный Sheet управляет фокусом, а каждая панель имеет собственное место и прокрутку.
import { useLayoutEffect, useRef, useState } from "react";
import { useInterviewSession } from "../interview/useInterviewSession";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "../ui/sheet";
import { Button } from "../ui/button";
import { InterviewPanel } from "./InterviewPanel";
import { VacancyPreview } from "./VacancyPreview";
import "./composer.css";

type Choice = {
  title: string;
  description: string;
  approve: string;
  run: () => void;
};

/** Открывает левый слой из-под правого. Никакой переход превью не изменяет геометрию интервью. */
export function VacancyComposer({
  onExit,
  onConnect,
}: {
  onExit: () => void;
  onConnect: () => void;
}) {
  const session = useInterviewSession(true);
  const { state, dispatch, start } = session;
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null);
  const origin = useRef<HTMLElement | null>(null);
  const promptOrigin = useRef<HTMLElement | null>(null);
  const restorePrompt = useRef(false);
  const right = useRef<HTMLElement>(null);
  const left = useRef<HTMLElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const previewWasOpen = useRef(false);
  const returnStage = useRef(state.stage);

  useLayoutEffect(() => {
    if (choice) {
      cancelButton.current?.focus();
      return;
    }
    if (restorePrompt.current) {
      restorePrompt.current = false;
      const target = promptOrigin.current;
      if (target?.isConnected && !target.closest("[inert]")) {
        target.focus({ preventScroll: true });
        return;
      }
    }
    if (open) left.current?.querySelector<HTMLElement>("h2")?.focus();
    else if (previewWasOpen.current) {
      const target = origin.current;
      if (target?.isConnected) target.focus({ preventScroll: true });
      else right.current?.querySelector<HTMLElement>("h2")?.focus();
    }
    previewWasOpen.current = open;
  }, [choice, open]);

  /** Запоминает кнопку, к которой можно вернуться при отказе от действия. */
  function ask(next: Choice) {
    promptOrigin.current = document.activeElement as HTMLElement;
    setChoice(next);
  }
  /** Закрывает только верхнее подтверждение и возвращает фокус на его источник. */
  function dismissChoice() {
    restorePrompt.current = true;
    setChoice(null);
  }
  /** Останавливает незавершённую операцию перед выходом и сохраняет введённый текст при отмене. */
  function leave(run: () => void) {
    const dirty =
      !!state.active ||
      !!state.result ||
      state.answers.some((a) => a.text || a.confirmedText !== null);
    if (state.active?.phase === "recording") dispatch({ type: "stop" });
    else if (state.active?.phase === "waiting") dispatch({ type: "cancel" });
    if (!dirty) {
      run();
      return;
    }
    ask({
      title: "Выйти из интервью?",
      description:
        "Ответы и черновик хранятся в этой вкладке. При выходе они будут удалены.",
      approve: "Выйти",
      run,
    });
  }
  /** Защищает непринятый фрагмент и текущую запись при переходе к другому вопросу. */
  function navigate(index: number) {
    if (state.stage === "interview" && index === state.index) return;
    const run = () => dispatch({ type: "navigate", index });
    if (!state.active) {
      run();
      return;
    }
    if (state.active.phase === "recording") dispatch({ type: "stop" });
    ask({
      title: "Перейти к другой теме?",
      description:
        "Непринятый фрагмент будет удалён. Введённый текст останется в ответе.",
      approve: "Перейти",
      run,
    });
  }
  /** При закрытии отменяет текущую сборку, сохраняя предыдущую редакцию и положение интервью. */
  function back() {
    if (returnStage.current === "interview")
      dispatch({ type: "navigate", index: state.index });
    else dispatch({ type: "review" });
    setOpen(false);
  }
  /** При повторной сборке предупреждает о замене внесённых в превью правок. */
  function generate() {
    if (!state.answers.every((a) => a.confirmed) || state.active) return;
    const run = () => {
      dispatch({ type: "review" });
      start("generation");
    };
    if (state.result && Object.keys(state.result.edits).length)
      ask({
        title: "Заменить ручные правки?",
        description:
          "При успешной сборке разделы будут заполнены заново из подтверждённых ответов.",
        approve: "Пересобрать",
        run,
      });
    else run();
  }
  /** Готовая редакция открывается из памяти. Первый запрос запускается сразу при открытии. */
  function showPreview() {
    if (open || (!state.result && !state.answers.every((a) => a.confirmed)))
      return;
    origin.current = document.activeElement as HTMLElement;
    returnStage.current = state.stage;
    if (!state.result) generate();
    else dispatch({ type: "message", text: "" });
    setOpen(true);
  }
  /** Escape, фон и запрос Radix на закрытие всегда действуют на верхний слой. */
  function dismiss() {
    if (choice) dismissChoice();
    else if (open) back();
    else leave(onExit);
  }
  return (
    <Sheet
      open
      onOpenChange={(value) => {
        if (!value) dismiss();
      }}
    >
      <SheetContent
        className="composer-host"
        showCloseButton={false}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          right.current?.querySelector<HTMLElement>("h2")?.focus();
        }}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          dismiss();
        }}
        onPointerDownOutside={(e) => {
          e.preventDefault();
          dismiss();
        }}
      >
        <SheetTitle className="sr-only">Создание вакансии в Искре</SheetTitle>
        <SheetDescription className="sr-only">
          Подтвердите четыре ответа, затем откройте редактируемый черновик
          вакансии.
        </SheetDescription>
        <div className="ix-mask" data-open={open}>
          <section
            ref={left}
            className="ix-pane ix-preview"
            inert={!open || !!choice}
            aria-hidden={!open || !!choice}
            aria-labelledby="ix-preview-title"
          >
            <VacancyPreview
              key={open ? "open" : "closed"}
              session={session}
              back={back}
              generate={generate}
            />
          </section>
        </div>
        <section
          ref={right}
          className="ix-pane ix-interview"
          data-covered={open}
          inert={open || !!choice}
          aria-hidden={open || !!choice}
          aria-labelledby="ix-interview-title"
        >
          <InterviewPanel
            session={session}
            navigate={navigate}
            close={() => leave(onExit)}
            connect={() => leave(onConnect)}
            preview={showPreview}
            previewActive={open}
          />
        </section>
        {open && <div aria-hidden="true" className="ix-interview-shield" />}
        {choice && (
          <div
            className="ix-prompt-back"
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) dismissChoice();
            }}
          >
            <section
              className="ix-prompt"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="ix-prompt-title"
              aria-describedby="ix-prompt-desc"
            >
              <h3 id="ix-prompt-title">{choice.title}</h3>
              <p id="ix-prompt-desc">{choice.description}</p>
              <div className="ix-actions">
                <Button
                  ref={cancelButton}
                  variant="outline"
                  onClick={dismissChoice}
                >
                  Остаться
                </Button>
                <Button
                  onClick={() => {
                    setChoice(null);
                    choice.run();
                  }}
                >
                  {choice.approve}
                </Button>
              </div>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
