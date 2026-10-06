import { cn } from "cn";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      role={props["aria-label"] ? "status" : undefined}
      aria-busy={props["aria-label"] ? true : undefined}
      aria-hidden={props["aria-label"] ? undefined : true}
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
