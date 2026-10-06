import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { FieldGroup } from "@/components/ui/field";
import { buttonVariants } from "@/components/ui/button-variants";
import type { VariantProps } from "class-variance-authority";

export function LinkButton({
  className,
  variant = "default",
  size = "default",
  disabled,
  children,
  ...props
}: ComponentProps<typeof Link> &
  VariantProps<typeof buttonVariants> & { disabled?: boolean }) {
  const styles = cn(
    buttonVariants({ variant, size }),
    disabled && "pointer-events-none opacity-70",
    className,
  );
  if (disabled)
    return (
      <span role="link" aria-disabled="true" className={styles}>
        {children}
      </span>
    );
  return (
    <Link className={styles} {...props}>
      {children}
    </Link>
  );
}

type Crumb = { label: ReactNode; href?: string };

export function PageHeader({
  title,
  description,
  breadcrumbs = [],
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  breadcrumbs?: Crumb[];
  actions?: ReactNode;
}) {
  return (
    <header className="flex min-w-0 flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        {breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {breadcrumbs.map((crumb, index) => (
                <li key={index} className="flex items-center gap-1.5">
                  {index > 0 && (
                    <ChevronRight className="size-3" aria-hidden="true" />
                  )}
                  {crumb.href ? (
                    <Link
                      href={crumb.href}
                      className="inline-flex items-center rounded-sm hover:text-foreground hover:underline max-sm:min-h-11"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span>{crumb.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <h1 className="text-2xl leading-8 font-semibold tracking-tight text-balance break-words">
          {title}
        </h1>
        {description && (
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </header>
  );
}

export function PageStack({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-8", className)} {...props} />
  );
}

export function SectionHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-lg leading-7 font-semibold">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}

export function Toolbar({
  children,
  label = "Filters and context",
  className,
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <section
      aria-label={label}
      className={cn(
        "flex flex-col gap-4 rounded-lg border bg-card p-4 sm:p-5",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function FieldGrid({
  className,
  ...props
}: ComponentProps<typeof FieldGroup>) {
  return (
    <FieldGroup
      className={cn("grid gap-5 sm:grid-cols-2", className)}
      {...props}
    />
  );
}

export function FormActions({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-2 border-t pt-5",
        className,
      )}
      {...props}
    />
  );
}

export function DetailList({
  items,
}: {
  items: { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="grid min-w-0 gap-x-8 gap-y-5 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs font-medium text-muted-foreground">
            {item.label}
          </dt>
          <dd className="mt-1 break-words text-sm text-foreground">
            {item.value === "" || item.value == null ? "—" : item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const statusTones: Record<
  string,
  "success" | "warning" | "destructive" | "info" | "secondary"
> = {
  active: "success",
  present: "success",
  paid: "success",
  completed: "success",
  admitted: "success",
  accepted: "success",
  approved: "success",
  published: "success",
  locked: "success",
  pending: "warning",
  late: "warning",
  submitted: "warning",
  under_review: "warning",
  partially_paid: "warning",
  open: "info",
  absent: "destructive",
  rejected: "destructive",
  overdue: "destructive",
  reversed: "destructive",
  excused: "info",
  exempt: "info",
  passed: "success",
  failed: "destructive",
  incomplete: "warning",
  withdrawn: "destructive",
  enquiry: "info",
  linked: "info",
};

export function StatusBadge({
  status,
  children,
  className,
}: {
  status: string | null;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Badge
      variant={status ? (statusTones[status] ?? "secondary") : "outline"}
      className={className}
    >
      {children ??
        (status
          ? status
              .replaceAll("_", " ")
              .replace(/^./, (letter) => letter.toUpperCase())
          : "Not marked")}
    </Badge>
  );
}
