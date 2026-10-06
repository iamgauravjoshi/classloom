import type { ReactNode } from "react";
import { CircleAlert, Inbox } from "lucide-react";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
  EmptyContent,
} from "@/components/ui/empty";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

export function EmptyState({
  title,
  description,
  action,
  headingLevel = 2,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  headingLevel?: 1 | 2 | 3;
}) {
  const Title = `h${headingLevel}` as "h1" | "h2" | "h3";
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Inbox aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>
          <Title>{title}</Title>
        </EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
}: {
  title?: string;
  description: string;
}) {
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  );
}

export function LoadingPanel({
  label = "Loading content",
}: {
  label?: string;
}) {
  return (
    <div
      className="flex flex-col gap-4 rounded-lg border bg-card px-6 py-8"
      role="status"
      aria-label={label}
      aria-busy="true"
    >
      <span className="sr-only">{label}…</span>
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}
