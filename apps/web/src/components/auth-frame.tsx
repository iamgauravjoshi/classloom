import type { ReactNode } from "react";
import Link from "next/link";
import { BookOpen, ClipboardCheck, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";

export function AuthFrame({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <aside
        className="hidden flex-col justify-between border-r bg-card p-12 lg:flex xl:p-16"
        aria-label="About ClassLoom"
      >
        <Link href="/login" className="w-fit rounded-lg">
          <Brand />
        </Link>
        <div className="flex max-w-lg flex-col gap-8">
          <div className="flex flex-col gap-4">
            <span className="text-sm font-medium text-brand-foreground">
              Your school, thoughtfully organized
            </span>
            <h2 className="text-4xl leading-tight font-semibold tracking-tight">
              More clarity.
              <br />
              More time for your school.
            </h2>
            <p className="text-base leading-7 text-muted-foreground">
              A connected workspace for the people, plans, and everyday work
              that keep your school moving.
            </p>
          </div>
          <div className="flex flex-col gap-5 text-text-secondary">
            {[
              {
                icon: BookOpen,
                title: "Connected academic work",
                description:
                  "Classes, timetables, attendance, and examinations.",
              },
              {
                icon: ClipboardCheck,
                title: "Clear school operations",
                description: "People, admissions, fees, and payment records.",
              },
              {
                icon: ShieldCheck,
                title: "Access that respects your role",
                description: "School information stays within your workspace.",
              },
            ].map(({ icon: Icon, title: label, description: detail }) => (
              <div key={label} className="flex items-start gap-3">
                <Icon
                  className="mt-0.5 size-5 shrink-0 text-brand-foreground"
                  aria-hidden="true"
                />
                <div>
                  <h3 className="text-sm font-medium text-foreground">
                    {label}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Built for the everyday work of schools.
        </p>
      </aside>
      <div className="flex flex-col items-center justify-center px-6 py-12 sm:px-12">
        <div className="mb-12 lg:hidden">
          <Link href="/login" className="rounded-lg">
            <Brand />
          </Link>
        </div>
        <section
          className="flex w-full max-w-sm flex-col gap-8"
          aria-label={title}
        >
          <header className="flex flex-col gap-3">
            <h1 className="text-2xl leading-8 font-semibold tracking-tight">
              {title}
            </h1>
            <p className="text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </header>
          {children}
          {footer && (
            <div className="text-center text-sm text-muted-foreground">
              {footer}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
