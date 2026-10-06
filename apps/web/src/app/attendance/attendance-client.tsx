"use client";

import { ReloadPageButton } from "@/components/reload-page-button";

import { DateField } from "@/components/date-field";

import { ChoiceField as FilterSelect } from "@/components/choice-field";

import {
  PageHeader,
  PageStack,
  SectionHeader,
  StatusBadge,
  Toolbar,
} from "@/components/product-ui";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { AlertCircle, Check, CircleAlert, Clock3, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "@/components/ui/toast";
import {
  listAttendanceEvents,
  listAttendanceSchools,
  listAttendanceSections,
  listAttendanceSessions,
  readAttendanceRegister,
  saveAttendanceRegister,
  type AttendanceEvent,
  type AttendanceRegister,
  type AttendanceRosterEntry,
  type AttendanceSchool,
  type AttendanceSection,
  type AttendanceSession,
  type AttendanceStatus,
} from "@/lib/attendance-api";

const statusOptions: {
  value: AttendanceStatus;
  label: string;
  Icon: typeof Check;
}[] = [
  { value: "present", label: "Present", Icon: Check },
  { value: "absent", label: "Absent", Icon: X },
  { value: "late", label: "Late", Icon: Clock3 },
  { value: "excused", label: "Excused", Icon: CircleAlert },
];
const failureMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The attendance request could not be completed. Please try again.";
const formatDate = (value: string) => format(parseISO(value), "PPP");

function StatusPicker({
  entry,
  disabled,
  onChange,
}: {
  entry: AttendanceRosterEntry;
  disabled: boolean;
  onChange: (status: AttendanceStatus) => void;
}) {
  return (
    <ToggleGroup
      aria-label={`Attendance status for ${entry.displayName}`}
      value={entry.status ? [entry.status] : []}
      onValueChange={(values) => {
        const next = values[0];
        if (next) onChange(next as AttendanceStatus);
      }}
      disabled={disabled}
      variant="outline"
      spacing={1}
      className="flex-wrap max-sm:grid max-sm:w-full max-sm:grid-cols-2"
    >
      {statusOptions.map(({ value, label, Icon }) => (
        <ToggleGroupItem
          key={value}
          value={value}
          aria-label={`${entry.displayName}: ${label}`}
          title={label}
          className="px-3 max-sm:justify-start"
        >
          <Icon aria-hidden="true" />
          <span>{label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function sessionDefaultDate(session: AttendanceSession, today: string) {
  return today > session.endDate
    ? session.endDate
    : today < session.startDate
      ? session.startDate
      : today;
}

export function AttendanceClient() {
  const schoolControlId = useId();
  const sessionControlId = useId();
  const sectionControlId = useId();
  const dateControlId = useId();
  const [schools, setSchools] = useState<AttendanceSchool[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [sections, setSections] = useState<AttendanceSection[]>([]);
  const [sectionId, setSectionId] = useState("");
  const [date, setDate] = useState("");
  const [registerData, setRegisterData] = useState<AttendanceRegister | null>(
    null,
  );
  const [draftEntries, setDraftEntries] = useState<AttendanceRosterEntry[]>([]);
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingSections, setLoadingSections] = useState(false);
  const [loadingRegister, setLoadingRegister] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const activeRegisterRequest = useRef(0);
  const activeEventsRequest = useRef(0);

  const school = schools.find((item) => item.id === schoolId);
  const session = sessions.find((item) => item.id === sessionId);
  const canRecord = Boolean(school?.canRecordAttendance);
  const availableSessions = useMemo(
    () => sessions.filter((item) => !school || item.startDate <= school.today),
    [sessions, school],
  );
  const completion = useMemo(() => {
    const counts = {
      total: draftEntries.length,
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
      unmarked: 0,
      complete: false,
    };
    for (const entry of draftEntries) {
      if (entry.status) counts[entry.status] += 1;
      else counts.unmarked += 1;
    }
    counts.complete = counts.total > 0 && counts.unmarked === 0;
    return counts;
  }, [draftEntries]);
  const savedStatusKey =
    registerData?.entries
      .map((entry) => `${entry.academicEnrollmentId}:${entry.status ?? ""}`)
      .join("|") ?? "";
  const draftStatusKey = draftEntries
    .map((entry) => `${entry.academicEnrollmentId}:${entry.status ?? ""}`)
    .join("|");
  const dirty = Boolean(registerData) && savedStatusKey !== draftStatusKey;

  useEffect(() => {
    let cancelled = false;
    listAttendanceSchools()
      .then((result) => {
        if (cancelled) return;
        setSchools(result);
        setLoadingSessions(Boolean(result[0]));
        setSchoolId(result[0]?.id ?? "");
      })
      .catch((cause) => {
        if (!cancelled) {
          setLoadingSections(false);
          setLoadingRegister(false);
          const detail = failureMessage(cause);
          setError(detail);
          toast.add({
            type: "error",
            title: "Could not load attendance schools",
            description: detail,
            priority: "high",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSchools(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!school) return;
    let cancelled = false;
    listAttendanceSessions(school.id)
      .then((result) => {
        if (cancelled) return;
        setSessions(result);
        const eligible = result.filter(
          (item) => item.startDate <= school.today,
        );
        const selected =
          eligible.find((item) => item.status === "active") ??
          [...eligible].sort((a, b) =>
            b.startDate.localeCompare(a.startDate),
          )[0];
        setLoadingSections(Boolean(selected));
        setLoadingRegister(Boolean(selected));
        setSessionId(selected?.id ?? "");
        setDate(selected ? sessionDefaultDate(selected, school.today) : "");
      })
      .catch((cause) => {
        if (!cancelled) {
          const detail = failureMessage(cause);
          setError(detail);
          toast.add({
            type: "error",
            title: "Could not load academic sessions",
            description: detail,
            priority: "high",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSessions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [school]);

  useEffect(() => {
    if (!schoolId || !sessionId) return;
    let cancelled = false;
    listAttendanceSections(schoolId, sessionId)
      .then((result) => {
        if (!cancelled) {
          setSections(result);
          setSectionId(result[0]?.id ?? "");
          setLoadingRegister(Boolean(result[0]));
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setLoadingRegister(false);
          const detail = failureMessage(cause);
          setError(detail);
          toast.add({
            type: "error",
            title: "Could not load sections",
            description: detail,
            priority: "high",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSections(false);
      });
    return () => {
      cancelled = true;
    };
  }, [schoolId, sessionId]);

  useEffect(() => {
    if (!schoolId || !sessionId || !sectionId || !date) return;
    const requestId = ++activeRegisterRequest.current;
    readAttendanceRegister(schoolId, sessionId, date, sectionId)
      .then((result) => {
        if (requestId === activeRegisterRequest.current) {
          setRegisterData(result);
          setDraftEntries(result.entries);
          setError("");
        }
      })
      .catch((cause) => {
        if (requestId === activeRegisterRequest.current) {
          const detail = failureMessage(cause);
          setError(detail);
          toast.add({
            type: "error",
            title: "Could not load attendance register",
            description: detail,
            priority: "high",
          });
        }
      })
      .finally(() => {
        if (requestId === activeRegisterRequest.current)
          setLoadingRegister(false);
      });
    return () => {
      activeRegisterRequest.current += 1;
    };
  }, [schoolId, sessionId, sectionId, date]);

  useEffect(() => {
    if (!schoolId || !registerData?.register?.id) return;
    const requestId = ++activeEventsRequest.current;
    listAttendanceEvents(schoolId, registerData.register.id)
      .then((result) => {
        if (requestId === activeEventsRequest.current) setEvents(result);
      })
      .catch((cause) => {
        if (requestId === activeEventsRequest.current) {
          const detail = failureMessage(cause);
          toast.add({
            type: "error",
            title: "Could not load change history",
            description: detail,
            priority: "high",
          });
        }
      });
    return () => {
      activeEventsRequest.current += 1;
    };
  }, [schoolId, registerData?.register?.id]);

  function changeSchool(value: string) {
    activeRegisterRequest.current += 1;
    setSchoolId(value);
    setSessions([]);
    setSessionId("");
    setSections([]);
    setSectionId("");
    setDate("");
    setRegisterData(null);
    setDraftEntries([]);
    setEvents([]);
    setLoadingSessions(true);
    setLoadingSections(false);
    setLoadingRegister(false);
    setError("");
  }

  function changeSession(value: string) {
    const nextSession = sessions.find((item) => item.id === value);
    activeRegisterRequest.current += 1;
    setSessionId(value);
    setDate(
      nextSession && school
        ? sessionDefaultDate(nextSession, school.today)
        : "",
    );
    setSections([]);
    setSectionId("");
    setRegisterData(null);
    setDraftEntries([]);
    setEvents([]);
    setLoadingSections(Boolean(value));
    setLoadingRegister(Boolean(value && nextSession));
    setError("");
  }

  function changeSection(value: string) {
    activeRegisterRequest.current += 1;
    setSectionId(value);
    setRegisterData(null);
    setDraftEntries([]);
    setEvents([]);
    setLoadingRegister(Boolean(value && date));
    setError("");
  }

  function setStatus(academicEnrollmentId: string, status: AttendanceStatus) {
    setDraftEntries((current) =>
      current.map((entry) =>
        entry.academicEnrollmentId === academicEnrollmentId
          ? { ...entry, status }
          : entry,
      ),
    );
  }

  function markAll(status: AttendanceStatus) {
    setDraftEntries((current) =>
      current.map((entry) => ({ ...entry, status })),
    );
  }

  async function save() {
    if (
      !schoolId ||
      !sessionId ||
      !sectionId ||
      !date ||
      !canRecord ||
      !completion.complete
    )
      return;
    setSaving(true);
    setError("");
    try {
      const result = await saveAttendanceRegister(
        schoolId,
        sessionId,
        date,
        sectionId,
        draftEntries.map((entry) => ({
          academicEnrollmentId: entry.academicEnrollmentId,
          status: entry.status!,
        })),
      );
      setRegisterData(result);
      setDraftEntries(result.entries);
      toast.add({
        type: "success",
        title: "Attendance saved",
        description: "The complete class register has been recorded.",
      });
    } catch (cause) {
      const detail = failureMessage(cause);
      setError(detail);
      toast.add({
        type: "error",
        title: "Could not save attendance",
        description: detail,
        priority: "high",
      });
    } finally {
      setSaving(false);
    }
  }

  function changeDate(nextDate?: Date) {
    if (!nextDate) return;
    activeRegisterRequest.current += 1;
    setDate(format(nextDate, "yyyy-MM-dd"));
    setRegisterData(null);
    setDraftEntries([]);
    setEvents([]);
    setLoadingRegister(Boolean(sectionId));
    setError("");
  }

  return (
    <PageStack>
      <PageHeader
        title={<>Attendance</>}
        description={
          <>Record and review daily attendance for each class section.</>
        }
        breadcrumbs={[{ label: "Academics" }]}
        actions={
          <>
            {school?.canRecordAttendance && (
              <Button
                type="button"
                disabled={
                  !registerData ||
                  !completion.complete ||
                  !dirty ||
                  saving ||
                  loadingRegister
                }
                onClick={() => void save()}
              >
                <Check data-icon="inline-start" />
                {saving ? "Saving attendance…" : "Save attendance"}
              </Button>
            )}
          </>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Could not complete the request</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            {!registerData && !saving && <ReloadPageButton />}
          </AlertDescription>
        </Alert>
      )}
      {loadingSchools ? (
        <Skeleton
          className="h-24 w-full"
          aria-label="Loading attendance schools"
        />
      ) : schools.length === 0 && error ? null : schools.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No attendance access</EmptyTitle>
            <EmptyDescription>
              Your active workspace does not have attendance access for any
              school.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <Toolbar label="Class register">
            <SectionHeader
              title={<>Class register</>}
              description={
                <>Choose a school, academic session, section, and date.</>
              }
            />
            <div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <FilterSelect
                  id={schoolControlId}
                  label="School"
                  disabled={saving}
                  value={schoolId}
                  options={schools.map(({ id, name }) => ({ id, name }))}
                  placeholder="Choose school"
                  onChange={changeSchool}
                />
                <FilterSelect
                  id={sessionControlId}
                  label="Academic session"
                  value={sessionId}
                  options={availableSessions.map((item) => ({
                    id: item.id,
                    name: `${item.name} · ${item.status}`,
                  }))}
                  placeholder={
                    loadingSessions ? "Loading sessions…" : "Choose session"
                  }
                  disabled={
                    saving || loadingSessions || !availableSessions.length
                  }
                  onChange={changeSession}
                />
                <FilterSelect
                  id={sectionControlId}
                  label="Class and section"
                  value={sectionId}
                  options={sections.map((item) => ({
                    id: item.id,
                    name: item.label,
                  }))}
                  placeholder={
                    loadingSections ? "Loading sections…" : "Choose section"
                  }
                  disabled={saving || loadingSections || !sections.length}
                  onChange={changeSection}
                />
                <DateField
                  id={dateControlId}
                  label="Attendance date"
                  value={date}
                  onChange={(value) => changeDate(parseISO(value))}
                  min={session?.startDate}
                  max={
                    school && session
                      ? school.today < session.endDate
                        ? school.today
                        : session.endDate
                      : undefined
                  }
                  disabled={saving || !school || !session}
                />
              </div>
            </div>
          </Toolbar>

          {school && !school.canReadAttendance && !canRecord ? (
            <Alert>
              <AlertTitle>Read access is unavailable</AlertTitle>
              <AlertDescription>
                Your role cannot view attendance for this school.
              </AlertDescription>
            </Alert>
          ) : loadingSessions ? (
            <Skeleton
              className="h-72 w-full"
              aria-label="Loading academic sessions"
            />
          ) : availableSessions.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No current or past academic sessions</EmptyTitle>
                <EmptyDescription>
                  Attendance can be recorded only for dates that have already
                  occurred within an academic session.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : !sectionId && !loadingSections ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No assigned sections</EmptyTitle>
                <EmptyDescription>
                  No sections are available for attendance in this session.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : loadingRegister || loadingSections ? (
            <Skeleton
              className="h-80 w-full"
              aria-label="Loading attendance register"
            />
          ) : registerData && draftEntries.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No enrolled students</EmptyTitle>
                <EmptyDescription>
                  This section has no students enrolled on{" "}
                  {date ? formatDate(date) : "the selected date"}.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : registerData ? (
            <>
              <Card>
                <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>
                      {sections.find((item) => item.id === sectionId)?.label ??
                        "Section register"}
                    </CardTitle>
                    <CardDescription>
                      {session?.name} · {date ? formatDate(date) : ""}
                    </CardDescription>
                  </div>
                  <div
                    className="flex flex-wrap items-center gap-2"
                    aria-label="Attendance completion summary"
                  >
                    <Badge
                      variant={completion.complete ? "default" : "secondary"}
                    >
                      {completion.complete
                        ? "Complete"
                        : `${completion.unmarked} unmarked`}
                    </Badge>
                    <Badge variant="outline">{completion.total} students</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {canRecord ? (
                    <div
                      className="flex flex-wrap items-center gap-2"
                      aria-label="Bulk attendance actions"
                    >
                      <span className="mr-1 text-sm font-medium">
                        Mark all:
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={saving}
                        onClick={() => markAll("present")}
                      >
                        All present
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={saving}
                        onClick={() => markAll("absent")}
                      >
                        All absent
                      </Button>
                    </div>
                  ) : (
                    <Alert>
                      <AlertTitle>Read-only register</AlertTitle>
                      <AlertDescription>
                        You can review attendance, but your role cannot record
                        or correct it.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="hidden overflow-x-auto md:block">
                    <Table aria-label="Attendance register">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Roll no.</TableHead>
                          <TableHead>Student</TableHead>
                          <TableHead>Current status</TableHead>
                          <TableHead>Mark attendance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {draftEntries.map((entry) => (
                          <TableRow key={entry.academicEnrollmentId}>
                            <TableCell>{entry.rollNumber || "—"}</TableCell>
                            <TableCell className="font-medium">
                              {entry.displayName}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={entry.status} />
                            </TableCell>
                            <TableCell>
                              <StatusPicker
                                entry={entry}
                                disabled={!canRecord || saving}
                                onChange={(status) =>
                                  setStatus(entry.academicEnrollmentId, status)
                                }
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex flex-col gap-3 md:hidden">
                    {draftEntries.map((entry) => (
                      <article
                        key={entry.academicEnrollmentId}
                        className="rounded-lg border bg-card p-3"
                      >
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate font-medium">
                              {entry.displayName}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              Roll no. {entry.rollNumber || "—"}
                            </p>
                          </div>
                          <StatusBadge status={entry.status} />
                        </div>
                        <StatusPicker
                          entry={entry}
                          disabled={!canRecord || saving}
                          onChange={(status) =>
                            setStatus(entry.academicEnrollmentId, status)
                          }
                        />
                      </article>
                    ))}
                  </div>

                  {canRecord && (
                    <p className="text-sm text-muted-foreground">
                      Choose one status for every student, then save the
                      complete register. Corrections are added to the change
                      history.
                    </p>
                  )}
                </CardContent>
              </Card>

              {registerData.register && (
                <Card>
                  <CardHeader>
                    <CardTitle>Change history</CardTitle>
                    <CardDescription>
                      Previous saved changes to this attendance register.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {events.length ? (
                      <ol className="flex flex-col gap-3">
                        {events.map((event, index) => (
                          <li
                            key={`${event.createdAt}-${index}`}
                            className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 last:border-0 last:pb-0"
                          >
                            <div className="flex items-center gap-2 text-sm">
                              <StatusBadge status={event.previousStatus} />
                              <span aria-hidden="true">→</span>
                              <StatusBadge status={event.status} />
                              <span className="text-muted-foreground">
                                {event.previousStatus
                                  ? "Corrected"
                                  : "Recorded"}
                              </span>
                            </div>
                            <time
                              className="text-xs text-muted-foreground"
                              dateTime={event.createdAt}
                            >
                              {new Date(event.createdAt).toLocaleString()}
                            </time>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No status changes have been saved for this register.
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          ) : null}
        </>
      )}
    </PageStack>
  );
}
