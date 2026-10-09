"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  Menu,
  Moon,
  School,
  Sun,
  Users,
  Wallet,
  ContactRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Brand } from "@/components/brand";
import { LogoutButton } from "@/components/logout-button";
import {
  WorkspaceProvider,
  useWorkspace,
} from "@/components/workspace-context";
import { cn } from "@/lib/utils";

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const access = useWorkspace();
  const groups = [
    {
      label: "Workspace",
      items: [
        {
          label: "Overview",
          href: "/dashboard",
          icon: LayoutDashboard,
          visible: true,
        },
      ],
    },
    {
      label: "People",
      items: [
        {
          label: "Students",
          href: "/students",
          icon: Users,
          visible: access.people.some((s) => s.canReadStudents),
        },
        {
          label: "Guardians",
          href: "/guardians",
          icon: ContactRound,
          visible: access.people.some((s) => s.canReadGuardians),
        },
        {
          label: "Staff & teachers",
          href: "/staff",
          icon: GraduationCap,
          visible: access.people.some((s) => s.canReadStaff),
        },
      ],
    },
    {
      label: "Academics",
      items: [
        {
          label: "Academic setup",
          href: "/academic-setup",
          icon: School,
          visible: access.academic.length > 0,
        },
        {
          label: "Timetable",
          href: "/timetable",
          icon: CalendarDays,
          visible: access.timetable.some(
            (s) => s.canReadTimetable || s.canManageTimetable,
          ),
        },
        {
          label: "Attendance",
          href: "/attendance",
          icon: ClipboardCheck,
          visible: access.attendance.some(
            (s) => s.canReadAttendance || s.canRecordAttendance,
          ),
        },
        {
          label: "Examinations",
          href: "/examinations",
          icon: ClipboardList,
          visible: access.examinations.some(
            (s) => s.canRead || s.canManage || s.canEnter || s.canApprove,
          ),
        },
        {
          label: "Results & report cards",
          href: "/results",
          icon: GraduationCap,
          visible: access.results.schools.length > 0,
        },
        {
          label: "My report cards",
          href: "/report-cards",
          icon: ClipboardList,
          visible: access.results.canReadOwn,
        },
      ],
    },
    {
      label: "Operations",
      items: [
        {
          label: "Admissions",
          href: "/admissions",
          icon: ClipboardList,
          visible: access.admissions.some(
            (s) =>
              s.canReadAdmissions ||
              s.canManageAdmissions ||
              s.canConvertAdmissions,
          ),
        },
        {
          label: "Fees & payments",
          href: "/fees",
          icon: Wallet,
          visible: access.finance.some(
            (s) => s.canRead || s.canManage || s.canRecord || s.canAdjust,
          ),
        },
      ],
    },
  ];
  return (
    <nav
      aria-label="Main navigation"
      className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-6"
    >
      {groups.map((group) => {
        const items = group.items.filter((item) => item.visible);
        if (!items.length) return null;
        return (
          <div key={group.label} className="flex flex-col gap-1">
            <p className="mb-1 px-3 text-xs font-medium text-muted-foreground">
              {group.label}
            </p>
            {items.map(({ label, href, icon: Icon }) => {
              const active =
                pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-muted hover:text-foreground",
                    active &&
                      "bg-brand-soft text-brand-foreground hover:bg-brand-soft",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span>{label}</span>
                  {active && (
                    <span
                      className="ml-auto size-1.5 rounded-full bg-primary"
                      aria-hidden="true"
                    />
                  )}
                </Link>
              );
            })}
          </div>
        );
      })}
      {access.loading && (
        <div
          className="flex flex-col gap-3 px-3"
          aria-label="Loading navigation"
        >
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-4/5" />
        </div>
      )}
      {access.failed.length > 0 && (
        <div className="px-3 text-xs text-muted-foreground">
          <p>Some navigation could not load.</p>
          <Button size="sm" variant="link" onClick={access.retry}>
            Retry navigation
          </Button>
        </div>
      )}
    </nav>
  );
}

function ThemeToggle() {
  const dark = useSyncExternalStore(
    (notify) => {
      window.addEventListener("classloom-theme-change", notify);
      return () => window.removeEventListener("classloom-theme-change", notify);
    },
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("classloom-theme", next ? "dark" : "light");
    } catch {
      /* Theme still works when storage is unavailable. */
    }
    window.dispatchEvent(new Event("classloom-theme-change"));
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
      onClick={toggle}
    >
      {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  );
}

function Shell({
  children,
  accountName,
  accountEmail,
}: {
  children: React.ReactNode;
  accountName: string;
  accountEmail: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const access = useWorkspace();
  const schools = new Map(
    [
      ...access.people,
      ...access.academic,
      ...access.attendance,
      ...access.finance,
      ...access.admissions,
      ...access.timetable,
      ...access.examinations,
    ].map((s) => [s.id, s.name]),
  );
  const context =
    schools.size === 1
      ? [...schools.values()][0]
      : schools.size > 1
        ? `${schools.size} schools in your workspace`
        : "School workspace";
  const initials = accountName.includes("@")
    ? accountName.slice(0, 2)
    : accountName
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join("");
  return (
    <div className="flex min-h-dvh">
      <a
        href="#main-content"
        className="fixed top-3 left-3 z-50 -translate-y-20 rounded-lg bg-primary px-4 py-3 text-primary-foreground focus:translate-y-0"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh w-62 shrink-0 flex-col border-r bg-card lg:flex">
        <Link
          href="/dashboard"
          className="flex h-16 shrink-0 items-center border-b px-6"
          aria-label="ClassLoom overview"
        >
          <Brand />
        </Link>
        <Navigation />
        <div className="border-t px-6 py-5">
          <p className="text-xs font-medium text-foreground">
            ClassLoom workspace
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Designed for your school day.
          </p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-card px-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="lg:hidden"
                    aria-label="Open navigation"
                  />
                }
              >
                <Menu aria-hidden="true" />
              </SheetTrigger>
              <SheetContent side="left" className="w-72 gap-0" showCloseButton>
                <SheetHeader className="border-b pb-5">
                  <SheetTitle>
                    <Brand />
                  </SheetTitle>
                  <SheetDescription>
                    Navigate your school workspace.
                  </SheetDescription>
                </SheetHeader>
                <Navigation onNavigate={() => setMenuOpen(false)} />
              </SheetContent>
            </Sheet>
            <School
              className="hidden size-4 shrink-0 text-muted-foreground sm:block"
              aria-hidden="true"
            />
            <span className="truncate text-sm font-medium">{context}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-3">
            <ThemeToggle />
            <span className="hidden h-6 border-l sm:block" aria-hidden="true" />
            <Avatar>
              <AvatarFallback>{initials.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="hidden min-w-0 sm:block">
              <p className="max-w-48 truncate text-sm font-medium">
                {accountName}
              </p>
              {accountName !== accountEmail && (
                <p className="max-w-48 truncate text-xs text-muted-foreground">
                  {accountEmail}
                </p>
              )}
            </div>
            <LogoutButton />
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-400 min-w-0 flex-1 p-(--space-page) outline-none"
        >
          {children}
        </main>
        <footer className="flex flex-wrap justify-between gap-2 px-(--space-page) py-5 text-xs text-muted-foreground">
          <span>© 2026 ClassLoom</span>
          <span>School management, thoughtfully organized.</span>
        </footer>
      </div>
    </div>
  );
}

export function AppShell({
  children,
  accountName = "School account",
  accountEmail = "",
}: {
  children: React.ReactNode;
  accountName?: string;
  accountEmail?: string;
}) {
  return (
    <WorkspaceProvider>
      <Shell accountName={accountName} accountEmail={accountEmail}>
        {children}
      </Shell>
    </WorkspaceProvider>
  );
}
