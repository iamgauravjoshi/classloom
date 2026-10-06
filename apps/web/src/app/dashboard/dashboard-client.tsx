"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  Users,
  Wallet,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace-context";
import {
  PageHeader,
  PageStack,
  SectionHeader,
  LinkButton,
  StatusBadge,
} from "@/components/product-ui";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { LoadingPanel, EmptyState } from "@/components/states";
import { listAdmissionCases, type AdmissionCase } from "@/lib/admissions-api";
import { getAcademicSetup, type AcademicSetup } from "@/lib/academics-api";

export function DashboardClient({ name }: { name: string }) {
  const access = useWorkspace();
  const [cases, setCases] = useState<AdmissionCase[]>([]);
  const [setup, setSetup] = useState<AcademicSetup | null>(null);
  const [pending, setPending] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const admissionSchool = access.admissions.find((s) => s.canReadAdmissions);
  const academicSchool = access.academic[0];
  const admissionSchoolId = admissionSchool?.id;
  const academicSchoolId = academicSchool?.id;
  useEffect(() => {
    if (access.loading) return;
    let current = true;
    Promise.allSettled([
      admissionSchoolId
        ? listAdmissionCases(admissionSchoolId, { limit: 5 })
        : Promise.resolve(null),
      academicSchoolId
        ? getAcademicSetup(academicSchoolId)
        : Promise.resolve(null),
    ]).then(([admissions, academics]) => {
      if (!current) return;
      setCases(
        admissions.status === "fulfilled"
          ? (admissions.value?.items ?? [])
          : [],
      );
      setSetup(academics.status === "fulfilled" ? academics.value : null);
      setErrors([
        ...(admissions.status === "rejected" ? ["Recent admissions"] : []),
        ...(academics.status === "rejected" ? ["Academic context"] : []),
      ]);
      setPending(false);
    });
    return () => {
      current = false;
    };
  }, [access.loading, admissionSchoolId, academicSchoolId, revision]);

  const tasks = [
    {
      title: "Attendance",
      description: "Open a class register and record today's outcomes.",
      action: access.attendance.some((s) => s.canRecordAttendance)
        ? "Mark attendance"
        : "View attendance",
      href: "/attendance",
      icon: ClipboardCheck,
      visible: access.attendance.length > 0,
    },
    {
      title: "Fees & payments",
      description: "Review student balances, receipts, and outstanding fees.",
      action: "Open fees & payments",
      href: "/fees",
      icon: Wallet,
      visible: access.finance.length > 0,
    },
    {
      title: "Admissions",
      description: "Move enquiries and applications through their next stage.",
      action: "Open admissions",
      href: "/admissions",
      icon: ClipboardList,
      visible: access.admissions.some(
        (s) =>
          s.canReadAdmissions ||
          s.canManageAdmissions ||
          s.canConvertAdmissions,
      ),
    },
  ].filter((task) => task.visible);
  const directories = [
    {
      label: "Students",
      description: "Profiles, guardians, and enrollment",
      href: "/students",
      icon: Users,
      visible: access.people.some((s) => s.canReadStudents),
    },
    {
      label: "Staff & teachers",
      description: "People and school assignments",
      href: "/staff",
      icon: GraduationCap,
      visible: access.people.some((s) => s.canReadStaff),
    },
    {
      label: "Timetable",
      description: "Your recurring weekly schedule",
      href: "/timetable",
      icon: CalendarDays,
      visible: access.timetable.length > 0,
    },
    {
      label: "Examinations",
      description: "Assessment sheets and reviewed marks",
      href: "/examinations",
      icon: ClipboardList,
      visible: access.examinations.length > 0,
    },
  ].filter((item) => item.visible);
  const session = setup?.sessions.find((s) => s.status === "active");
  return (
    <PageStack>
      <PageHeader
        title="Overview"
        description={`Welcome back${name ? `, ${name}` : ""}. Choose the school work you want to move forward.`}
        breadcrumbs={[{ label: "Your workspace" }]}
        actions={
          access.timetable.length > 0 && (
            <LinkButton href="/timetable" variant="outline">
              <CalendarDays data-icon="inline-start" />
              View timetable
            </LinkButton>
          )
        }
      />
      {access.failed.length > 0 && (
        <Alert>
          <AlertTitle>Some workspace information is unavailable</AlertTitle>
          <AlertDescription>
            Available areas are shown below.{" "}
            <Button variant="link" onClick={access.retry}>
              Retry workspace information
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {access.loading ? (
        <LoadingPanel />
      ) : (
        <>
          {tasks.length > 0 && (
            <section
              className="flex flex-col gap-4"
              aria-label="School workflows"
            >
              <SectionHeader
                title="Keep the school day moving"
                description="Your operational workflows, in one place."
              />
              <div className="grid gap-4 md:grid-cols-3">
                {tasks.map(
                  ({ title, description, action, href, icon: Icon }) => (
                    <Card key={href}>
                      <CardHeader>
                        <Icon
                          className="mb-2 size-5 text-brand-foreground"
                          aria-hidden="true"
                        />
                        <CardTitle>{title}</CardTitle>
                        <CardDescription>{description}</CardDescription>
                      </CardHeader>
                      <CardContent className="mt-auto">
                        <LinkButton
                          href={href}
                          variant="outline"
                          className="w-full justify-between"
                        >
                          {action}
                          <ArrowRight data-icon="inline-end" />
                        </LinkButton>
                      </CardContent>
                    </Card>
                  ),
                )}
              </div>
            </section>
          )}
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <section
              className="flex min-w-0 flex-col gap-4"
              aria-label="Recent admissions"
            >
              <SectionHeader
                title="Recent admissions"
                description={
                  admissionSchool
                    ? admissionSchool.name
                    : "Your role's available work"
                }
                actions={
                  admissionSchool && (
                    <LinkButton
                      href={`/admissions?school=${admissionSchool.id}`}
                      size="sm"
                      variant="ghost"
                    >
                      View worklist
                      <ArrowRight data-icon="inline-end" />
                    </LinkButton>
                  )
                }
              />
              {pending ? (
                <LoadingPanel />
              ) : errors.includes("Recent admissions") ? (
                <Alert variant="destructive">
                  <AlertTitle>Could not load admissions</AlertTitle>
                  <AlertDescription>
                    Your records are unchanged.{" "}
                    <Button
                      variant="link"
                      onClick={() => setRevision((v) => v + 1)}
                    >
                      Try again
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : admissionSchool ? (
                cases.length ? (
                  <div className="divide-y rounded-lg border bg-card">
                    {cases.map((record) => (
                      <Link
                        key={record.id}
                        href={`/admissions/${record.id}?school=${admissionSchool.id}`}
                        className="flex min-h-20 flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-muted"
                      >
                        <div className="min-w-0">
                          <p className="font-medium">
                            {[
                              record.studentPreferredName ||
                                record.studentGivenName,
                              record.studentFamilyName,
                            ]
                              .filter(Boolean)
                              .join(" ") || "Applicant details pending"}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {record.caseReference}
                          </p>
                        </div>
                        <StatusBadge status={record.status} />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No enquiries yet"
                    description="New admissions will appear here as your school begins processing enquiries."
                    action={
                      admissionSchool.canManageAdmissions && (
                        <LinkButton
                          href={`/admissions/new?school=${admissionSchool.id}`}
                        >
                          New enquiry
                        </LinkButton>
                      )
                    }
                  />
                )
              ) : (
                <EmptyState
                  title="Choose an available workflow"
                  description="Use the areas shown in your navigation to continue your school work."
                />
              )}
            </section>
            <section
              className="flex min-w-0 flex-col gap-5"
              aria-label="Academic context"
            >
              <SectionHeader
                title="Academic context"
                description={setup?.school.name ?? "School workspace"}
              />
              {setup && (
                <div className="rounded-lg border bg-card p-5">
                  <p className="text-xs font-medium text-muted-foreground">
                    Active academic session
                  </p>
                  <p className="mt-2 text-lg font-semibold">
                    {session?.name ?? "No active session"}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {session
                      ? `${setup.classes.filter((c) => c.sessionId === session.id).length} classes · ${setup.sections.filter((s) => s.sessionId === session.id).length} sections`
                      : "Open academic setup to prepare your next session."}
                  </p>
                  <LinkButton
                    variant="link"
                    href="/academic-setup"
                    className="mt-3 px-0"
                  >
                    View academic setup
                    <ArrowRight data-icon="inline-end" />
                  </LinkButton>
                </div>
              )}
              {errors.includes("Academic context") && (
                <Alert>
                  <AlertTitle>Academic context could not load</AlertTitle>
                  <AlertDescription>
                    <Button
                      variant="link"
                      onClick={() => setRevision((v) => v + 1)}
                    >
                      Retry academic context
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              <div className="flex flex-col gap-1">
                {directories.map(({ label, description, href, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center gap-3 rounded-lg p-3 hover:bg-muted"
                  >
                    <Icon
                      className="size-5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">
                        {description}
                      </p>
                    </div>
                    <ArrowRight
                      className="size-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </PageStack>
  );
}
