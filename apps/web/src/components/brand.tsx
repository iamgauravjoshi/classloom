import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 text-xl font-semibold tracking-tight",
        className,
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
        <BookOpen className="size-5" aria-hidden="true" />
      </span>
      <span>ClassLoom</span>
    </span>
  );
}
