import type { ReactNode } from "react";
import { Brand } from "@/components/brand";
import { LinkButton } from "@/components/product-ui";
import { EmptyState } from "@/components/states";

export function RecoveryPage({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-12">
      <Brand />
      <div className="w-full max-w-lg rounded-xl border bg-card">
        <EmptyState
          headingLevel={1}
          title={title}
          description={description}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {action}
              <LinkButton href="/dashboard" variant="outline">
                Go to overview
              </LinkButton>
            </div>
          }
        />
      </div>
    </main>
  );
}
