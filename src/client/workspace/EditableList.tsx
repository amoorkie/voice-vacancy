// Каждый пункт выглядит как строка готовой вакансии и сразу принимает ввод с клавиатуры.
import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { Textarea } from "../ui/textarea";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};
/** Делит и объединяет пункты, сохраняя положение курсора после смены строки. */
export function EditableList({ label, value, onChange }: Props) {
  const rows = value.split("\n");
  const list = useRef<HTMLUListElement>(null);
  const nextFocus = useRef<{ index: number; caret: number } | null>(null);
  useLayoutEffect(() => {
    const target = nextFocus.current;
    if (!target) return;
    nextFocus.current = null;
    const field = list.current?.querySelectorAll("textarea")[target.index];
    field?.focus();
    field?.setSelectionRange(target.caret, target.caret);
  }, [value]);

  /** Нативная вставка или Enter могут дать несколько строк внутри одного пункта. */
  function change(index: number, text: string, caret: number) {
    const replacement = text.split("\n");
    if (replacement.length > 1) {
      const prefix = text.slice(0, caret).split("\n");
      nextFocus.current = {
        index: index + prefix.length - 1,
        caret: prefix[prefix.length - 1].length,
      };
    }
    const updated = rows.slice();
    updated.splice(index, 1, ...replacement);
    onChange(updated.join("\n"));
  }

  /** Возвращает обычное поведение Backspace и Delete на границе соседних пунктов. */
  function join(event: KeyboardEvent<HTMLTextAreaElement>, index: number) {
    const field = event.currentTarget;
    if (
      event.nativeEvent.isComposing ||
      field.selectionStart !== field.selectionEnd
    )
      return;
    const previous =
      event.key === "Backspace" && field.selectionStart === 0 && index > 0;
    const following =
      event.key === "Delete" &&
      field.selectionStart === field.value.length &&
      index < rows.length - 1;
    if (!previous && !following) return;
    event.preventDefault();
    const first = previous ? index - 1 : index;
    nextFocus.current = { index: first, caret: rows[first].length };
    const updated = rows.slice();
    updated.splice(first, 2, rows[first] + rows[first + 1]);
    onChange(updated.join("\n"));
  }

  return (
    <ul ref={list}>
      {rows.map((row, index) => (
        <li key={index}>
          <Textarea
            className="ix-inline-text"
            rows={1}
            value={row}
            placeholder="Добавить пункт"
            aria-label={label + ", пункт " + (index + 1)}
            onKeyDown={(e) => join(e, index)}
            onChange={(e) =>
              change(
                index,
                e.currentTarget.value,
                e.currentTarget.selectionStart,
              )
            }
            onPaste={(e) => {
              const plain = e.clipboardData
                .getData("text/plain")
                .replace(/\r\n?/g, "\n");
              const cleaned = plain.replace(/^[•*-][ \t]+/gm, "");
              if (plain === cleaned) return;
              e.preventDefault();
              const {
                value: startText,
                selectionStart,
                selectionEnd,
              } = e.currentTarget;
              change(
                index,
                startText.slice(0, selectionStart) +
                  cleaned +
                  startText.slice(selectionEnd),
                selectionStart + cleaned.length,
              );
              if (!cleaned.includes("\n"))
                nextFocus.current = {
                  index,
                  caret: selectionStart + cleaned.length,
                };
            }}
          />
        </li>
      ))}
    </ul>
  );
}
