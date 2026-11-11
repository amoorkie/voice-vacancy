// Кольцо показывает подтверждённые темы, а стеклянная кнопка управляет записью отдельно от прогресса.
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

const SEGMENTS = 60;

/** Плавно окрашивает сегменты по часовой стрелке; значение остаётся доступно без анимации. */
export function ProgressRing({
  completed,
  total = 4,
  children,
  recording = false,
  compact = false,
  initialCompleted = completed,
}: {
  completed: number;
  total?: number;
  children: ReactNode;
  recording?: boolean;
  compact?: boolean;
  initialCompleted?: number;
}) {
  const [shown, setShown] = useState(initialCompleted);
  const count = Math.round(
    (Math.max(0, Math.min(shown, total)) / total) * SEGMENTS,
  );
  const [previous, setPrevious] = useState(count);
  useEffect(() => {
    // Сначала браузер рисует прежнее заполнение, в том числе при переходе в обзор после четвёртой темы.
    setPrevious(count);
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setShown(completed));
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [completed]);

  return (
    <div
      className={`progress-orbit ${recording ? "is-recording" : ""} ${compact ? "compact" : ""}`}
    >
      <svg
        className="progress-segments"
        viewBox="0 0 400 400"
        role="progressbar"
        aria-label="Прогресс интервью"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={completed}
        aria-valuetext={`Подтверждено ${completed} из ${total} тем`}
      >
        {Array.from({ length: SEGMENTS }, (_, index) => {
          const changed =
            index >= Math.min(previous, count) &&
            index < Math.max(previous, count);
          const order =
            count > previous ? index - previous : previous - index - 1;
          return (
            <line
              key={index}
              x1="200"
              y1="9"
              x2="200"
              y2="21"
              transform={`rotate(${index * (360 / SEGMENTS)} 200 200)`}
              className={`progress-segment ${index < count ? "is-filled" : ""}`}
              style={
                {
                  "--segment-delay": `${changed ? Math.max(0, order) * 22 : 0}ms`,
                } as CSSProperties
              }
            />
          );
        })}
      </svg>
      <div className="orbit-center">{children}</div>
    </div>
  );
}
