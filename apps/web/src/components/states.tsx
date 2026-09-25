import type { ReactNode } from "react";
import { CircleAlert, Inbox } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <Inbox className="size-9 text-muted-foreground" aria-hidden="true" />
        <h2 className="font-semibold">{title}</h2>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
        {action}
      </CardContent>
    </Card>
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
    <Card role="alert">
      <CardContent className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <CircleAlert className="size-9 text-destructive" aria-hidden="true" />
        <h2 className="font-semibold">{title}</h2>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

export function LoadingPanel() {
  return (
    <Card aria-label="Loading content" aria-busy="true">
      <CardContent className="space-y-4 px-6 py-8">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-2/3" />
      </CardContent>
    </Card>
  );
}
