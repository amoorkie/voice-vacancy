// Компонент из реестра shadcn/ui. Условия использования приведены в src/client/ui/LICENSE.
import { cn } from "@/client/lib/utils";

/** Обозначает место ожидаемого содержимого. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-accent", className)}
      {...props}
    />
  );
}

export { Skeleton };
