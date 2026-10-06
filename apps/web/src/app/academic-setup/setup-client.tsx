"use client";

import { ChoiceField as Choice } from "@/components/choice-field";

import {
  FieldGrid,
  FormActions,
  PageHeader,
  PageStack,
  SectionHeader,
  StatusBadge,
  Toolbar,
} from "@/components/product-ui";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, LoadingPanel } from "@/components/states";
import { isBefore } from "date-fns";
import {
  BookOpen,
  CalendarDays,
  GraduationCap,
  Plus,
  Users,
  RefreshCw,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  activateAcademicSession,
  addAcademicAssignment,
  addAcademicClass,
  addAcademicSection,
  addAcademicSession,
  addAcademicSubject,
  getAcademicSetup,
  listAcademicSchools,
  listAcademicStaff,
  type AcademicSchool,
  type AcademicSetup,
  type AcademicStaffAccount,
} from "@/lib/academics-api";
import { switchAcademicSession } from "@/lib/academic-selection";
import { toast } from "@/components/ui/toast";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { parseDateOnly } from "@/lib/date-only";
import { DateField } from "@/components/date-field";

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The request could not be completed";
}

function NamedForm({
  title,
  description,
  onCreate,
  disabled,
}: {
  title: string;
  description: string;
  onCreate: (values: { name: string; code: string }) => Promise<boolean>;
  disabled: boolean;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const fieldPrefix = title.toLowerCase().replaceAll(" ", "-");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await onCreate({ name, code })) {
      setName("");
      setCode("");
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} aria-label={title}>
          <fieldset disabled={disabled}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={`${fieldPrefix}-name`}>Name</FieldLabel>
                <Input
                  id={`${fieldPrefix}-name`}
                  required
                  minLength={2}
                  maxLength={120}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={`e.g. ${title === "Add class" ? "Grade 1" : "Mathematics"}`}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${fieldPrefix}-code`}>Code</FieldLabel>
                <Input
                  id={`${fieldPrefix}-code`}
                  required
                  maxLength={20}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="e.g. G1"
                />
              </Field>
              <FormActions>
                <Button disabled={disabled} type="submit">
                  <Plus data-icon="inline-start" />
                  {title}
                </Button>
              </FormActions>
            </FieldGroup>
          </fieldset>
        </form>
      </CardContent>
    </Card>
  );
}

export function AcademicSetupClient() {
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [readVersion, setReadVersion] = useState(0);
  const [refreshNeeded, setRefreshNeeded] = useState(false);
  const [schools, setSchools] = useState<AcademicSchool[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [setup, setSetup] = useState<AcademicSetup | null>(null);
  const [staff, setStaff] = useState<AcademicStaffAccount[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [membershipId, setMembershipId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dateErrors, setDateErrors] = useState<{
    start?: string;
    end?: string;
  }>({});

  useEffect(() => {
    let current = true;
    listAcademicSchools()
      .then((items) => {
        if (current) {
          setSchools(items);
          setSchoolId((id) =>
            items.some((item) => item.id === id) ? id : (items[0]?.id ?? ""),
          );
        }
      })
      .catch((cause) => {
        if (current) {
          const detail = errorMessage(cause);
          setError(detail);
          toast.add({
            type: "error",
            title: "Could not load schools",
            description: detail,
            priority: "high",
          });
        }
      })
      .finally(() => {
        if (current) setLoadingSchools(false);
      });
    return () => {
      current = false;
    };
  }, [readVersion]);
  const refresh = useCallback(async (id: string) => {
    const [result, members] = await Promise.all([
      getAcademicSetup(id),
      listAcademicStaff(id),
    ]);
    setSetup(result);
    setStaff(members);
    setSessionId((current) =>
      result.sessions.some((item) => item.id === current)
        ? current
        : (result.sessions.find((item) => item.status === "active")?.id ??
          result.sessions.find((item) => item.status === "draft")?.id ??
          ""),
    );
  }, []);
  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;
    Promise.all([getAcademicSetup(schoolId), listAcademicStaff(schoolId)])
      .then(([result, members]) => {
        if (cancelled) return;
        setSetup(result);
        setStaff(members);
        setRefreshNeeded(false);
        setSessionId(
          result.sessions.find((item) => item.status === "active")?.id ??
            result.sessions.find((item) => item.status === "draft")?.id ??
            "",
        );
        setClassId("");
        setSectionId("");
        setSubjectId("");
        setMembershipId("");
      })
      .catch((cause) => {
        if (!cancelled) {
          const detail = errorMessage(cause);
          setError(detail);
          toast.add({
            type: "error",
            title: "Could not load academic setup",
            description: detail,
            priority: "high",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [schoolId, readVersion]);

  const session = setup?.sessions.find((item) => item.id === sessionId);
  const classes =
    setup?.classes.filter((item) => item.sessionId === sessionId) ?? [];
  const sections =
    setup?.sections.filter((item) => item.sessionId === sessionId) ?? [];
  const subjects =
    setup?.subjects.filter((item) => item.sessionId === sessionId) ?? [];
  const assignments =
    setup?.assignments.filter((item) => item.sessionId === sessionId) ?? [];
  const editable = Boolean(
    session && session.status !== "archived" && !refreshNeeded,
  );

  async function mutate(work: () => Promise<unknown>, message: string) {
    if (!schoolId || busy || refreshNeeded) return false;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      setNotice(message);
      toast.add({ type: "success", title: "Saved", description: message });
      try {
        await refresh(schoolId);
      } catch {
        setRefreshNeeded(true);
        setError(
          "Your changes were saved, but the updated records could not load. Refresh before making another change.",
        );
      }
      return true;
    } catch (cause) {
      const detail = errorMessage(cause);
      setError(detail);
      toast.add({
        type: "error",
        title: "Could not save changes",
        description: detail,
        priority: "high",
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageStack>
      <PageHeader
        title={<>Academic setup</>}
        description={
          <>
            Configure sessions, classes, sections, subjects and teaching
            assignments.
          </>
        }
        breadcrumbs={[{ label: "Academics" }]}
        actions={
          <Button
            variant="outline"
            disabled={busy || loadingSchools}
            onClick={() => {
              setError("");
              setReadVersion((version) => version + 1);
            }}
          >
            <RefreshCw data-icon="inline-start" />
            Refresh
          </Button>
        }
      />
      {error && (
        <Alert variant="destructive">
          <AlertTitle>
            {refreshNeeded
              ? "Refresh needed"
              : "Could not complete the request"}
          </AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert role="status">
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {!loadingSchools && schools.length === 0 && !error && (
        <Alert>
          <AlertTitle>No schools available</AlertTitle>
          <AlertDescription>
            Choose a workspace with access to a school to set up academics.
          </AlertDescription>
        </Alert>
      )}

      {loadingSchools ? (
        <LoadingPanel label="Loading academic schools" />
      ) : (
        schools.length > 0 && (
          <Toolbar label="School and academic session">
            <SectionHeader
              title={<>School and academic session</>}
              description={<>Choose a school and the session to configure.</>}
            />
            <div>
              <FieldGrid>
                <Choice
                  label="School"
                  disabled={busy}
                  value={schoolId}
                  onChange={(id) => {
                    setError("");
                    setNotice("");
                    setSchoolId(id);
                    setSetup(null);
                  }}
                  options={schools.map((item) => ({
                    id: item.id,
                    name: item.name,
                  }))}
                  placeholder="Select school"
                />
                <Choice
                  label="Academic session"
                  disabled={busy}
                  value={sessionId}
                  onChange={(value) => {
                    const next = switchAcademicSession(value);
                    setSessionId(next.sessionId);
                    setClassId(next.classId);
                    setSectionId(next.sectionId);
                    setSubjectId(next.subjectId);
                    setMembershipId(next.membershipId);
                  }}
                  options={(setup?.sessions ?? []).map((item) => ({
                    id: item.id,
                    name: `${item.name} · ${item.status}`,
                  }))}
                  placeholder="Create a session"
                />
              </FieldGrid>
            </div>
          </Toolbar>
        )
      )}
      {session?.status === "archived" && (
        <Alert>
          <AlertTitle>Archived session</AlertTitle>
          <AlertDescription>
            You can review this session. Academic configuration is read-only.
          </AlertDescription>
        </Alert>
      )}
      {schoolId &&
        (setup?.school.id !== schoolId ? (
          !error && <LoadingPanel label="Loading academic setup" />
        ) : (
          <Tabs defaultValue="sessions">
            <TabsList aria-label="Academic setup areas">
              <TabsTrigger value="sessions">Sessions</TabsTrigger>
              <TabsTrigger value="classes">Classes & sections</TabsTrigger>
              <TabsTrigger value="subjects">Subjects</TabsTrigger>
              <TabsTrigger value="teachers">Teacher assignments</TabsTrigger>
            </TabsList>
            <TabsContent keepMounted value="sessions">
              <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(20rem,1fr)]">
                <div className="min-w-0">
                  <Card>
                    <CardHeader>
                      <CardTitle>Session status</CardTitle>
                      <CardDescription>
                        Only one academic session is active per school.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                      {session ? (
                        <>
                          <div className="flex items-center justify-between rounded-lg border p-4">
                            <div>
                              <strong className="text-base">
                                {session.name}
                              </strong>
                              <p className="text-muted-foreground">
                                {session.startDate} to {session.endDate}
                              </p>
                            </div>
                            <StatusBadge status={session.status} />
                          </div>
                          {session.status === "draft" && (
                            <ConfirmationDialog
                              triggerLabel="Activate session"
                              title={`Activate ${session.name}?`}
                              description="The current active session will be archived."
                              confirmLabel="Activate session"
                              disabled={
                                busy ||
                                !classes.length ||
                                !sections.length ||
                                !subjects.length
                              }
                              onConfirm={() => {
                                void mutate(
                                  () =>
                                    activateAcademicSession(
                                      schoolId,
                                      session.id,
                                    ),
                                  "Academic session activated",
                                );
                              }}
                            />
                          )}
                          {session.status === "draft" &&
                            (!classes.length ||
                              !sections.length ||
                              !subjects.length) && (
                              <p className="text-sm text-muted-foreground">
                                Add at least one class, section, and subject to
                                activate.
                              </p>
                            )}
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Create a session to begin academic setup.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>
                <div className="flex min-w-0 flex-col gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>New academic session</CardTitle>
                      <CardDescription>
                        Set the calendar dates for a school year.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <form
                        onSubmit={async (event) => {
                          event.preventDefault();
                          const element = event.currentTarget;
                          const form = new FormData(element);
                          const nextErrors = {
                            start: startDate
                              ? undefined
                              : "Choose a start date.",
                            end: endDate ? undefined : "Choose an end date.",
                          };
                          if (
                            startDate &&
                            endDate &&
                            isBefore(
                              parseDateOnly(endDate),
                              parseDateOnly(startDate),
                            )
                          )
                            nextErrors.end =
                              "End date must be on or after the start date.";
                          setDateErrors(nextErrors);
                          if (nextErrors.start || nextErrors.end) return;
                          const saved = await mutate(
                            () =>
                              addAcademicSession(schoolId, {
                                name: String(form.get("name")),
                                code: String(form.get("code")),
                                startDate,
                                endDate,
                              }),
                            "Academic session created",
                          );
                          if (saved) {
                            element.reset();
                            setStartDate("");
                            setEndDate("");
                            setDateErrors({});
                          }
                        }}
                      >
                        <fieldset
                          disabled={busy || refreshNeeded}
                          className="min-w-0 border-0 p-0"
                        >
                          <FieldGroup>
                            <FieldGrid>
                              <Field>
                                <FieldLabel htmlFor="session-name">
                                  Session name
                                </FieldLabel>
                                <Input
                                  id="session-name"
                                  name="name"
                                  required
                                  placeholder="2026–27"
                                />
                              </Field>
                              <Field>
                                <FieldLabel htmlFor="session-code">
                                  Code
                                </FieldLabel>
                                <Input
                                  id="session-code"
                                  name="code"
                                  required
                                  placeholder="2026"
                                />
                              </Field>
                            </FieldGrid>
                            <FieldGrid>
                              <DateField
                                id="start-date"
                                label="Start date"
                                value={startDate}
                                error={dateErrors.start}
                                onChange={(next) => {
                                  setStartDate(next);
                                  setDateErrors({});
                                  if (
                                    endDate &&
                                    isBefore(
                                      parseDateOnly(endDate),
                                      parseDateOnly(next),
                                    )
                                  )
                                    setEndDate("");
                                }}
                              />
                              <DateField
                                id="end-date"
                                label="End date"
                                value={endDate}
                                error={dateErrors.end}
                                earliestDate={startDate || undefined}
                                onChange={(next) => {
                                  setEndDate(next);
                                  setDateErrors({});
                                }}
                              />
                            </FieldGrid>
                            <FormActions>
                              <Button type="submit" disabled={busy}>
                                <CalendarDays data-icon="inline-start" />
                                Create session
                              </Button>
                            </FormActions>
                          </FieldGroup>
                        </fieldset>
                      </form>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>
            <TabsContent keepMounted value="classes">
              {session ? (
                <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(20rem,1fr)]">
                  <div className="min-w-0">
                    <Card>
                      <CardHeader>
                        <CardTitle>
                          <GraduationCap className="inline size-4" /> Classes &
                          sections
                        </CardTitle>
                        <CardDescription>
                          {classes.length} classes · {sections.length} sections
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Table aria-label="Academic sessions">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Class</TableHead>
                              <TableHead>Sections</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {!classes.length && (
                              <TableRow>
                                <TableCell colSpan={2}>
                                  <EmptyState
                                    title="No classes yet"
                                    description="Add a class, then create its sections."
                                  />
                                </TableCell>
                              </TableRow>
                            )}
                            {classes.map((item) => (
                              <TableRow key={item.id}>
                                <TableCell>
                                  {item.name}{" "}
                                  <span className="text-muted-foreground">
                                    ({item.code})
                                  </span>
                                </TableCell>
                                <TableCell>
                                  {sections
                                    .filter(
                                      (section) => section.classId === item.id,
                                    )
                                    .map((section) => section.name)
                                    .join(", ") || "—"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </div>
                  <div className="flex min-w-0 flex-col gap-6">
                    <NamedForm
                      title="Add class"
                      description="Create a grade or class for this session."
                      disabled={busy || !editable}
                      onCreate={(input) =>
                        mutate(
                          () => addAcademicClass(schoolId, sessionId, input),
                          "Class created",
                        )
                      }
                    />
                    <Card>
                      <CardHeader>
                        <CardTitle>Add section</CardTitle>
                        <CardDescription>
                          Choose the class this section belongs to.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <form
                          onSubmit={async (event) => {
                            event.preventDefault();
                            const element = event.currentTarget;
                            const form = new FormData(element);
                            const saved = await mutate(
                              () =>
                                addAcademicSection(schoolId, classId, {
                                  name: String(form.get("name")),
                                  code: String(form.get("code")),
                                  ...(form.get("capacity")
                                    ? { capacity: Number(form.get("capacity")) }
                                    : {}),
                                }),
                              "Section created",
                            );
                            if (saved) element.reset();
                          }}
                        >
                          <fieldset
                            disabled={busy || !editable}
                            className="min-w-0 border-0 p-0"
                          >
                            <FieldGroup>
                              <Choice
                                label="Class"
                                value={classId}
                                onChange={setClassId}
                                options={classes}
                                placeholder="Select class"
                              />
                              <FieldGrid>
                                <Field>
                                  <FieldLabel htmlFor="section-name">
                                    Section name
                                  </FieldLabel>
                                  <Input
                                    id="section-name"
                                    name="name"
                                    required
                                    placeholder="Section A"
                                  />
                                </Field>
                                <Field>
                                  <FieldLabel htmlFor="section-code">
                                    Code
                                  </FieldLabel>
                                  <Input
                                    id="section-code"
                                    name="code"
                                    required
                                    placeholder="A"
                                  />
                                </Field>
                              </FieldGrid>
                              <Field>
                                <FieldLabel htmlFor="section-capacity">
                                  Capacity (optional)
                                </FieldLabel>
                                <Input
                                  id="section-capacity"
                                  name="capacity"
                                  type="number"
                                  min={1}
                                  max={1000}
                                />
                              </Field>
                              <FormActions>
                                <Button
                                  type="submit"
                                  disabled={busy || !editable || !classId}
                                >
                                  <Plus data-icon="inline-start" />
                                  Add section
                                </Button>
                              </FormActions>
                            </FieldGroup>
                          </fieldset>
                        </form>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              ) : (
                <EmptyState
                  title="Choose an academic session"
                  description="Create or select a session in the Sessions tab before configuring this school year."
                />
              )}
            </TabsContent>
            <TabsContent keepMounted value="subjects">
              {session ? (
                <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(20rem,1fr)]">
                  <div className="min-w-0">
                    <Card>
                      <CardHeader>
                        <CardTitle>
                          <BookOpen className="inline size-4" /> Subjects
                        </CardTitle>
                        <CardDescription>
                          {subjects.length} subjects in this session
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Table aria-label="Class sections">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Name</TableHead>
                              <TableHead>Code</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {!subjects.length && (
                              <TableRow>
                                <TableCell colSpan={2}>
                                  <EmptyState
                                    title="No subjects yet"
                                    description="Add the subjects taught in this academic session."
                                  />
                                </TableCell>
                              </TableRow>
                            )}
                            {subjects.map((item) => (
                              <TableRow key={item.id}>
                                <TableCell>{item.name}</TableCell>
                                <TableCell>{item.code}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </div>
                  <div className="flex min-w-0 flex-col gap-6">
                    <NamedForm
                      title="Add subject"
                      description="Subjects can be assigned to class sections."
                      disabled={busy || !editable}
                      onCreate={(input) =>
                        mutate(
                          () => addAcademicSubject(schoolId, sessionId, input),
                          "Subject created",
                        )
                      }
                    />
                  </div>
                </div>
              ) : (
                <EmptyState
                  title="Choose an academic session"
                  description="Create or select a session in the Sessions tab before configuring this school year."
                />
              )}
            </TabsContent>
            <TabsContent keepMounted value="teachers">
              {session ? (
                <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(20rem,1fr)]">
                  <div className="min-w-0">
                    <Card>
                      <CardHeader>
                        <CardTitle>
                          <Users className="inline size-4" /> Teacher
                          assignments
                        </CardTitle>
                        <CardDescription>
                          {assignments.length} section subject assignments
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Table aria-label="Teacher assignments">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Section / subject</TableHead>
                              <TableHead>Teacher or account</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {!assignments.length && (
                              <TableRow>
                                <TableCell colSpan={2}>
                                  <EmptyState
                                    title="No teacher assignments yet"
                                    description="Choose a section, subject, and eligible teacher to create an assignment."
                                  />
                                </TableCell>
                              </TableRow>
                            )}
                            {assignments.map((item) => {
                              const current = staff.find(
                                (member) => member.id === item.membershipId,
                              );
                              const historical = setup?.assignmentAccounts.find(
                                (member) => member.id === item.membershipId,
                              );
                              return (
                                <TableRow key={item.id}>
                                  <TableCell>
                                    {sections.find(
                                      (section) =>
                                        section.id === item.sectionId,
                                    )?.name ?? "Section"}{" "}
                                    /{" "}
                                    {subjects.find(
                                      (subject) =>
                                        subject.id === item.subjectId,
                                    )?.name ?? "Subject"}
                                  </TableCell>
                                  <TableCell>
                                    {current?.displayName ||
                                      current?.email ||
                                      historical?.displayName ||
                                      historical?.email ||
                                      "Former account"}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </div>
                  <div className="flex min-w-0 flex-col gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Assign teacher</CardTitle>
                        <CardDescription>
                          Choose an active teacher profile linked to a school
                          account.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <FieldGroup>
                          <Choice
                            label="Section"
                            value={sectionId}
                            onChange={setSectionId}
                            options={sections.map((item) => ({
                              id: item.id,
                              name: `${classes.find((klass) => klass.id === item.classId)?.name ?? "Class"} · ${item.name}`,
                            }))}
                            placeholder="Select section"
                          />
                          <Choice
                            label="Subject"
                            value={subjectId}
                            onChange={setSubjectId}
                            options={subjects}
                            placeholder="Select subject"
                          />
                          <Choice
                            label="Teacher"
                            value={membershipId}
                            onChange={setMembershipId}
                            options={staff.map((item) => ({
                              id: item.id,
                              name: item.displayName
                                ? `${item.displayName} (${item.email})`
                                : item.email,
                            }))}
                            placeholder="Select teacher"
                          />
                          <Button
                            disabled={
                              busy ||
                              !editable ||
                              !sectionId ||
                              !subjectId ||
                              !membershipId
                            }
                            onClick={() =>
                              void mutate(
                                () =>
                                  addAcademicAssignment(schoolId, sectionId, {
                                    subjectId,
                                    membershipId,
                                  }),
                                "Teacher assigned",
                              )
                            }
                          >
                            <Users data-icon="inline-start" />
                            Assign teacher
                          </Button>
                        </FieldGroup>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              ) : (
                <EmptyState
                  title="Choose an academic session"
                  description="Create or select a session in the Sessions tab before configuring this school year."
                />
              )}
            </TabsContent>
          </Tabs>
        ))}
    </PageStack>
  );
}
