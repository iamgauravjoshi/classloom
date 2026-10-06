"use client";

import { DateField } from "@/components/date-field";

import { ChoiceField as Choice } from "@/components/choice-field";

import {
  PageHeader,
  PageStack,
  SectionHeader,
  StatusBadge,
  Toolbar,
} from "@/components/product-ui";

import { useEffect, useId, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { Plus, RefreshCw } from "lucide-react";
import {
  addAssessment,
  changeExamState,
  createExam,
  decideCorrection,
  displayMark,
  formatScore,
  getExamSetup,
  listExamSchools,
  readExamSheet,
  requestCorrection,
  reviewExamSheet,
  saveExamMarks,
  scoreToHundredths,
  type ExamCorrection,
  type ExamMark,
  type ExamSchool,
  type ExamSetup,
  type ExamSheet,
  type ExamSheetData,
  type MarkStatus,
} from "@/lib/examinations-api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The request could not be completed. Please try again.";
const labelFor = (value: string) =>
  value.replaceAll("_", " ").replace(/^./, (char) => char.toUpperCase());
type DraftMark = { status: MarkStatus; text: string };
type Action =
  | { kind: "open" | "complete" | "submit" | "lock" | "return" }
  | { kind: "correction"; mark: ExamMark }
  | { kind: "approve" | "reject"; correction: ExamCorrection };

function TextField({
  label,
  name,
  decimal = false,
  defaultValue,
}: {
  label: string;
  name: string;
  decimal?: boolean;
  defaultValue?: string;
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        name={name}
        required
        maxLength={decimal ? 8 : 120}
        inputMode={decimal ? "decimal" : undefined}
        defaultValue={defaultValue}
      />
    </Field>
  );
}

function MarkControl({
  name,
  value,
  maximum,
  onChange,
  disabled,
  complete = false,
}: {
  name: string;
  value: DraftMark;
  maximum: number;
  onChange: (value: DraftMark) => void;
  disabled?: boolean;
  complete?: boolean;
}) {
  const id = useId();
  const options = (
    complete
      ? ["scored", "absent", "exempt"]
      : ["unmarked", "scored", "absent", "exempt"]
  ).map((status) => ({ id: status, name: labelFor(status) }));
  return (
    <div className="grid min-w-0 grid-cols-2 gap-3">
      <Choice
        label={`Outcome for ${name}`}
        value={value.status}
        options={options}
        placeholder="Choose outcome"
        disabled={disabled}
        onChange={(status) =>
          onChange({
            status: (status || "unmarked") as MarkStatus,
            text: status === "scored" ? value.text : "",
          })
        }
      />
      <Field>
        <FieldLabel htmlFor={id}>{`Marks for ${name}`}</FieldLabel>
        <Input
          id={id}
          inputMode="decimal"
          placeholder={`0–${formatScore(maximum)}`}
          maxLength={8}
          value={value.text}
          disabled={disabled || value.status !== "scored"}
          onChange={(event) => onChange({ ...value, text: event.target.value })}
        />
      </Field>
    </div>
  );
}

export function ExaminationsClient() {
  const [schools, setSchools] = useState<ExamSchool[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [setup, setSetup] = useState<ExamSetup | null>(null);
  const [examId, setExamId] = useState("");
  const [assessmentId, setAssessmentId] = useState("");
  const [sheet, setSheet] = useState<ExamSheet | null>(null);
  const [draft, setDraft] = useState<Record<string, DraftMark>>({});
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<"exam" | "assessment" | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [assessmentDate, setAssessmentDate] = useState("");
  const [action, setAction] = useState<Action | null>(null);
  const [actionOpen, setActionOpen] = useState(false);
  const [note, setNote] = useState("");
  const [proposal, setProposal] = useState<DraftMark>({
    status: "scored",
    text: "",
  });
  const writeInFlight = useRef(false);
  const school = schools.find((item) => item.id === schoolId);
  const exam = setup?.exams.find((item) => item.id === examId);
  const assessments =
    setup?.assessments.filter((item) => item.examId === examId) ?? [];
  const session = setup?.academic.sessions.find(
    (item) => item.id === sessionId,
  );
  const blocked = busy || paused;

  function fail(failure: unknown) {
    const message = errorText(failure);
    setError(message);
    toast.add({
      type: "error",
      title: "Examination action needs attention",
      description: message,
      priority: "high",
    });
  }
  function adoptSheet(value: ExamSheet) {
    setSheet(value);
    setDraft(
      Object.fromEntries(
        value.marks.map((mark) => [
          mark.id,
          {
            status: mark.status,
            text: mark.score === null ? "" : formatScore(mark.score),
          },
        ]),
      ),
    );
    setDirty(false);
  }
  useEffect(() => {
    let current = true;
    void listExamSchools()
      .then((items) => {
        if (current) {
          setSchools(items);
          setSchoolId(items[0]?.id ?? "");
          if (!items.length) setLoading(false);
        }
      })
      .catch((failure) => {
        if (current) {
          fail(failure);
          setLoading(false);
        }
      });
    return () => {
      current = false;
    };
  }, []);
  useEffect(() => {
    if (!schoolId) return;
    let current = true;
    void getExamSetup(schoolId)
      .then((value) => {
        if (current) {
          setSetup(value);
          setLoading(false);
          setError("");
        }
      })
      .catch((failure) => {
        if (current) {
          fail(failure);
          setLoading(false);
        }
      });
    return () => {
      current = false;
    };
  }, [schoolId]);
  useEffect(() => {
    if (!schoolId || !assessmentId) return;
    let current = true;
    void readExamSheet(schoolId, assessmentId)
      .then((value) => {
        if (current) {
          adoptSheet(value);
          setSheetLoading(false);
          setError("");
        }
      })
      .catch((failure) => {
        if (current) {
          fail(failure);
          setSheetLoading(false);
        }
      });
    return () => {
      current = false;
    };
  }, [schoolId, assessmentId]);

  async function refresh() {
    if (!schoolId) {
      const items = await listExamSchools();
      setSchools(items);
      setSchoolId(items[0]?.id ?? "");
      return;
    }
    const [newSetup, newSheet] = await Promise.all([
      getExamSetup(schoolId),
      assessmentId
        ? readExamSheet(schoolId, assessmentId)
        : Promise.resolve(null),
    ]);
    setSetup(newSetup);
    if (newSheet) adoptSheet(newSheet);
    setPaused(false);
    setError("");
  }
  async function mutate(
    title: string,
    work: () => Promise<unknown>,
    after?: (result: unknown) => void,
  ) {
    if (writeInFlight.current || paused) return;
    writeInFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await work();
      after?.(result);
      setFormOpen(false);
      setActionOpen(false);
      setPaused(true);
      toast.add({ type: "success", title });
      try {
        await refresh();
      } catch (failure) {
        fail(
          new Error(
            `${title}. Refresh the examination before another action: ${errorText(failure)}`,
          ),
        );
      }
    } catch (failure) {
      fail(failure);
    } finally {
      writeInFlight.current = false;
      setBusy(false);
    }
  }
  function sheetResult(result: unknown) {
    if (sheet)
      adoptSheet({
        ...(result as ExamSheetData),
        capabilities: sheet.capabilities,
        currentAccountId: sheet.currentAccountId,
      });
  }
  function chooseSchool(id: string) {
    setSchoolId(id);
    setSetup(null);
    setLoading(Boolean(id));
    setExamId("");
    setAssessmentId("");
    setSheet(null);
    setError("");
  }
  function chooseExam(id: string) {
    setExamId(id);
    setAssessmentId("");
    setSheet(null);
    setError("");
  }
  function chooseAssessment(id: string) {
    setAssessmentId(id);
    setSheet(null);
    setSheetLoading(Boolean(id));
    setError("");
  }
  function showForm(kind: "exam" | "assessment") {
    setError("");
    setSessionId("");
    setClassId("");
    setSectionId("");
    setSubjectId("");
    setStartDate("");
    setEndDate("");
    setAssessmentDate("");
    setForm(kind);
    setFormOpen(true);
  }
  function showAction(next: Action) {
    setError("");
    setAction(next);
    setActionOpen(true);
    setNote("");
    if (next.kind === "correction")
      setProposal({
        status: next.mark.status,
        text: next.mark.score === null ? "" : formatScore(next.mark.score),
      });
  }
  async function submitForm(data: FormData) {
    if (!setup) return;
    if (form === "exam") {
      if (!sessionId || !classId || !startDate || !endDate) {
        fail(new Error("Choose a session, class, and both examination dates"));
        return;
      }
      if (endDate < startDate) {
        fail(new Error("End date must be on or after the start date"));
        return;
      }
      await mutate(
        "Examination created",
        () =>
          createExam(schoolId, {
            sessionId,
            classId,
            name: String(data.get("name")),
            startDate,
            endDate,
          }),
        (result) => setExamId((result as { id: string }).id),
      );
    } else if (exam) {
      if (!sectionId || !subjectId || !assessmentDate) {
        fail(new Error("Choose a section, subject, and assessment date"));
        return;
      }
      try {
        const maximumScore = scoreToHundredths(String(data.get("maximum"))),
          passingScore = scoreToHundredths(
            String(data.get("passing")),
            maximumScore,
          );
        if (!maximumScore)
          throw new Error("Maximum marks must be greater than zero");
        await mutate("Assessment added", () =>
          addAssessment(schoolId, exam.id, {
            expectedVersion: exam.version,
            sectionId,
            subjectId,
            label: String(data.get("label")),
            assessmentDate,
            maximumScore,
            passingScore,
          }),
        );
      } catch (failure) {
        fail(failure);
      }
    }
  }
  async function save() {
    if (!sheet) return;
    try {
      const entries = sheet.marks.map((mark) => {
        const value = draft[mark.id];
        return {
          markId: mark.id,
          status: value.status,
          score:
            value.status === "scored"
              ? scoreToHundredths(value.text, sheet.assessment.maximumScore)
              : null,
        };
      });
      await mutate(
        "Marks saved",
        () => saveExamMarks(schoolId, sheet.assessment, entries),
        sheetResult,
      );
    } catch (failure) {
      fail(failure);
    }
  }
  async function performAction() {
    if (!action) return;
    try {
      if (action.kind === "open" || action.kind === "complete") {
        const kind = action.kind;
        if (exam)
          await mutate(
            kind === "open" ? "Examination opened" : "Examination completed",
            () => changeExamState(schoolId, exam, kind),
          );
      } else if (sheet) {
        const a = sheet.assessment;
        if (action.kind === "correction") {
          if (!note.trim())
            throw new Error("Enter a reason for the correction");
          const score =
            proposal.status === "scored"
              ? scoreToHundredths(proposal.text, a.maximumScore)
              : null;
          await mutate(
            "Correction requested",
            () =>
              requestCorrection(schoolId, a, {
                markId: action.mark.id,
                status: proposal.status,
                score,
                reason: note.trim(),
              }),
            sheetResult,
          );
        } else if (action.kind === "approve" || action.kind === "reject") {
          if (!note.trim()) throw new Error("Enter a reason for your decision");
          await mutate(
            `Correction ${action.kind === "approve" ? "approved" : "rejected"}`,
            () =>
              decideCorrection(
                schoolId,
                a,
                action.correction.id,
                action.kind,
                note.trim(),
              ),
            sheetResult,
          );
        } else {
          if (action.kind === "return" && !note.trim())
            throw new Error("Enter a reason for returning the sheet");
          const kind = action.kind;
          await mutate(
            `Marks sheet ${kind === "submit" ? "submitted" : kind === "lock" ? "locked" : "returned"}`,
            () => reviewExamSheet(schoolId, a, kind, note.trim() || undefined),
            sheetResult,
          );
        }
      }
    } catch (failure) {
      fail(failure);
    }
  }
  const isEntryDay =
    !sheet ||
    !school ||
    sheet.assessment.assessmentDate <=
      new Intl.DateTimeFormat("en-CA", {
        timeZone: school.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
  const editable = Boolean(
    sheet?.capabilities.canEnter &&
    sheet.exam.status === "open" &&
    sheet.assessment.status === "draft" &&
    isEntryDay,
  );
  const actionTitle =
    action?.kind === "correction"
      ? "Request a marks correction"
      : action?.kind === "approve" || action?.kind === "reject"
        ? `${labelFor(action.kind)} correction`
        : action?.kind === "open"
          ? "Open examination"
          : action?.kind === "complete"
            ? "Complete examination"
            : action?.kind === "submit"
              ? "Submit marks for review"
              : action?.kind === "lock"
                ? "Lock reviewed marks"
                : "Return marks for changes";
  const needsNote =
    action &&
    ["correction", "approve", "reject", "return"].includes(action.kind);

  return (
    <PageStack>
      <PageHeader
        title={<>Examinations</>}
        description={<>Plan assessments, record marks, and review changes.</>}
        breadcrumbs={[{ label: "Academics" }]}
        actions={
          <>
            <Button
              variant="outline"
              disabled={busy || dirty}
              onClick={() => {
                setBusy(true);
                void refresh()
                  .catch(fail)
                  .finally(() => setBusy(false));
              }}
            >
              <RefreshCw aria-hidden="true" />
              Refresh
            </Button>
          </>
        }
      />
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Examination action needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {paused && (
        <Alert>
          <AlertTitle>Refresh needed</AlertTitle>
          <AlertDescription>
            The last action succeeded. Refresh to load the latest state before
            making another change.
          </AlertDescription>
        </Alert>
      )}
      {loading && !school ? (
        <Skeleton className="h-48 w-full" />
      ) : !schools.length ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No examination schools available</EmptyTitle>
            <EmptyDescription>
              Ask a school administrator for examination access.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <Toolbar label="Examination workspace">
            <SectionHeader
              title={<>Examination workspace</>}
              description={
                <>
                  Select a school and examination to view its assessment sheets.
                </>
              }
            />
            <div>
              <FieldGroup className="grid gap-4 md:grid-cols-2">
                <Choice
                  label="School"
                  value={schoolId}
                  options={schools}
                  onChange={chooseSchool}
                  disabled={blocked || dirty}
                  placeholder="Choose school"
                />
                <Choice
                  label="Examination"
                  value={examId}
                  options={
                    setup?.exams.map((item) => ({
                      id: item.id,
                      name: `${item.name} · ${labelFor(item.status)}`,
                    })) ?? []
                  }
                  onChange={chooseExam}
                  disabled={blocked || dirty || loading}
                  placeholder="Choose examination"
                />
              </FieldGroup>
              {setup?.capabilities.canManage && (
                <Button
                  className="mt-4"
                  disabled={blocked || dirty}
                  onClick={() => showForm("exam")}
                >
                  <Plus aria-hidden="true" />
                  Create examination
                </Button>
              )}
            </div>
          </Toolbar>
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : !exam ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Select an examination</EmptyTitle>
                <EmptyDescription>
                  {setup?.capabilities.canManage
                    ? "Create an examination for a class, then add section and subject assessments."
                    : "Choose an examination to view the assessment sheets available to you."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-col gap-2">
                      <CardTitle>{exam.name}</CardTitle>
                      <CardDescription>
                        {
                          setup?.academic.classes.find(
                            (item) => item.id === exam.classId,
                          )?.name
                        }{" "}
                        · {format(parseISO(exam.startDate), "PP")} –{" "}
                        {format(parseISO(exam.endDate), "PP")}
                      </CardDescription>
                    </div>
                    <StatusBadge status={exam.status}>
                      {labelFor(exam.status)}
                    </StatusBadge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {setup?.capabilities.canManage && (
                    <div className="flex flex-wrap gap-2">
                      {exam.status === "draft" ? (
                        <>
                          <Button
                            variant="outline"
                            disabled={blocked || dirty}
                            onClick={() => showForm("assessment")}
                          >
                            <Plus aria-hidden="true" />
                            Add assessment
                          </Button>
                          <Button
                            disabled={blocked || !assessments.length}
                            onClick={() => showAction({ kind: "open" })}
                          >
                            Open examination
                          </Button>
                        </>
                      ) : (
                        exam.status === "open" && (
                          <Button
                            disabled={
                              blocked ||
                              dirty ||
                              !assessments.length ||
                              assessments.some((a) => a.status !== "locked")
                            }
                            onClick={() => showAction({ kind: "complete" })}
                          >
                            Complete examination
                          </Button>
                        )
                      )}
                    </div>
                  )}
                  <Choice
                    label="Assessment sheet"
                    value={assessmentId}
                    options={assessments.map((a) => ({
                      id: a.id,
                      name: `${a.label} · ${setup?.academic.sections.find((s) => s.id === a.sectionId)?.name ?? "Section"} · ${labelFor(a.status)}`,
                    }))}
                    onChange={chooseAssessment}
                    disabled={blocked || dirty}
                    placeholder="Choose assessment"
                  />
                  {!assessments.length && (
                    <p className="text-sm text-muted-foreground">
                      No assessments have been added.
                    </p>
                  )}
                </CardContent>
              </Card>
              {sheetLoading ? (
                <Skeleton className="h-72 w-full" />
              ) : (
                sheet && (
                  <Card>
                    <CardHeader>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex flex-col gap-2">
                          <CardTitle>{sheet.assessment.label}</CardTitle>
                          <CardDescription>
                            {format(
                              parseISO(sheet.assessment.assessmentDate),
                              "PP",
                            )}{" "}
                            · Maximum{" "}
                            {formatScore(sheet.assessment.maximumScore)} ·
                            Passing {formatScore(sheet.assessment.passingScore)}
                          </CardDescription>
                        </div>
                        <StatusBadge status={sheet.assessment.status}>
                          {labelFor(sheet.assessment.status)}
                        </StatusBadge>
                      </div>
                    </CardHeader>
                    <CardContent className="flex min-w-0 flex-col gap-5">
                      {!isEntryDay && (
                        <p className="text-sm text-muted-foreground">
                          Marks entry starts on the assessment date in the
                          school timezone.
                        </p>
                      )}
                      {!sheet.marks.length ? (
                        <Empty>
                          <EmptyHeader>
                            <EmptyTitle>Roster has not opened yet</EmptyTitle>
                            <EmptyDescription>
                              Opening the examination captures the enrolled
                              student roster for each assessment date.
                            </EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      ) : (
                        <>
                          <p className="text-sm text-muted-foreground">
                            {sheet.marks.length} students ·{" "}
                            {
                              sheet.marks.filter((m) => m.status !== "unmarked")
                                .length
                            }{" "}
                            saved outcomes{dirty ? " · Unsaved changes" : ""}
                          </p>
                          <div className="hidden md:block">
                            <Table aria-label="Assessment marks">
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Roll</TableHead>
                                  <TableHead>Student</TableHead>
                                  <TableHead>Outcome and marks</TableHead>
                                  {sheet.assessment.status === "locked" && (
                                    <TableHead>Actions</TableHead>
                                  )}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {sheet.marks.map((mark) => (
                                  <TableRow key={mark.id}>
                                    <TableCell>
                                      {mark.rollNumber ?? "—"}
                                    </TableCell>
                                    <TableCell className="font-medium">
                                      {mark.displayName}
                                    </TableCell>
                                    <TableCell>
                                      {editable ? (
                                        <MarkControl
                                          name={mark.displayName}
                                          value={draft[mark.id]}
                                          maximum={
                                            sheet.assessment.maximumScore
                                          }
                                          disabled={blocked}
                                          onChange={(value) => {
                                            setDraft((old) => ({
                                              ...old,
                                              [mark.id]: value,
                                            }));
                                            setDirty(true);
                                          }}
                                        />
                                      ) : (
                                        <span className="capitalize">
                                          {displayMark(mark.status, mark.score)}
                                        </span>
                                      )}
                                    </TableCell>
                                    {sheet.assessment.status === "locked" && (
                                      <TableCell>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          disabled={
                                            blocked ||
                                            !sheet.capabilities.canEnter ||
                                            !isEntryDay ||
                                            sheet.corrections.some(
                                              (c) =>
                                                c.markId === mark.id &&
                                                c.status === "pending",
                                            )
                                          }
                                          onClick={() =>
                                            showAction({
                                              kind: "correction",
                                              mark,
                                            })
                                          }
                                        >
                                          Request correction
                                        </Button>
                                      </TableCell>
                                    )}
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                          <div className="flex flex-col gap-3 md:hidden">
                            {sheet.marks.map((mark) => (
                              <Card key={mark.id}>
                                <CardContent className="flex flex-col gap-3">
                                  <div className="flex flex-wrap justify-between gap-2">
                                    <strong>{mark.displayName}</strong>
                                    <span className="text-sm text-muted-foreground">
                                      Roll {mark.rollNumber ?? "—"}
                                    </span>
                                  </div>
                                  {editable ? (
                                    <MarkControl
                                      name={mark.displayName}
                                      value={draft[mark.id]}
                                      maximum={sheet.assessment.maximumScore}
                                      disabled={blocked}
                                      onChange={(value) => {
                                        setDraft((old) => ({
                                          ...old,
                                          [mark.id]: value,
                                        }));
                                        setDirty(true);
                                      }}
                                    />
                                  ) : (
                                    <span className="capitalize">
                                      {displayMark(mark.status, mark.score)}
                                    </span>
                                  )}
                                  {sheet.assessment.status === "locked" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={
                                        blocked ||
                                        !sheet.capabilities.canEnter ||
                                        !isEntryDay ||
                                        sheet.corrections.some(
                                          (c) =>
                                            c.markId === mark.id &&
                                            c.status === "pending",
                                        )
                                      }
                                      onClick={() =>
                                        showAction({ kind: "correction", mark })
                                      }
                                    >
                                      Request correction
                                    </Button>
                                  )}
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {editable && (
                              <>
                                <Button
                                  disabled={blocked || !dirty}
                                  onClick={() => void save()}
                                >
                                  {busy ? "Saving…" : "Save marks"}
                                </Button>
                                <Button
                                  variant="outline"
                                  disabled={blocked || !dirty}
                                  onClick={() => adoptSheet(sheet)}
                                >
                                  Discard unsaved changes
                                </Button>
                                <Button
                                  variant="outline"
                                  disabled={
                                    blocked ||
                                    dirty ||
                                    sheet.marks.some(
                                      (m) => m.status === "unmarked",
                                    )
                                  }
                                  onClick={() => showAction({ kind: "submit" })}
                                >
                                  Submit for review
                                </Button>
                              </>
                            )}
                            {sheet.capabilities.canApprove &&
                              sheet.exam.status === "open" &&
                              sheet.assessment.status === "submitted" && (
                                <>
                                  <Button
                                    disabled={blocked}
                                    onClick={() => showAction({ kind: "lock" })}
                                  >
                                    Lock marks
                                  </Button>
                                  <Button
                                    variant="outline"
                                    disabled={blocked}
                                    onClick={() =>
                                      showAction({ kind: "return" })
                                    }
                                  >
                                    Return for changes
                                  </Button>
                                </>
                              )}
                          </div>
                          {sheet.corrections.length > 0 && (
                            <section
                              className="flex flex-col gap-3"
                              aria-label="Correction requests"
                            >
                              <h2 className="text-base font-semibold">
                                Correction requests
                              </h2>
                              {sheet.corrections.map((c) => (
                                <div
                                  key={c.id}
                                  className="flex flex-col gap-2 rounded-lg border p-4"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <strong>
                                      {
                                        sheet.marks.find(
                                          (m) => m.id === c.markId,
                                        )?.displayName
                                      }
                                    </strong>
                                    <StatusBadge status={c.status}>
                                      {labelFor(c.status)}
                                    </StatusBadge>
                                  </div>
                                  <p className="text-sm">
                                    {displayMark(
                                      c.previousStatus,
                                      c.previousScore,
                                    )}{" "}
                                    →{" "}
                                    {displayMark(
                                      c.proposedStatus,
                                      c.proposedScore,
                                    )}
                                  </p>
                                  <p className="wrap-break-word text-sm text-muted-foreground">
                                    {c.reason}
                                  </p>
                                  {c.decisionReason && (
                                    <p className="text-sm">
                                      Decision: {c.decisionReason}
                                    </p>
                                  )}
                                  {c.status === "pending" &&
                                    sheet.capabilities.canApprove &&
                                    (c.requestedByAccountId ===
                                    sheet.currentAccountId ? (
                                      <p className="text-sm text-muted-foreground">
                                        Another authorized account must review
                                        your correction.
                                      </p>
                                    ) : (
                                      <div className="flex gap-2">
                                        <Button
                                          size="sm"
                                          disabled={blocked}
                                          onClick={() =>
                                            showAction({
                                              kind: "approve",
                                              correction: c,
                                            })
                                          }
                                        >
                                          Approve
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          disabled={blocked}
                                          onClick={() =>
                                            showAction({
                                              kind: "reject",
                                              correction: c,
                                            })
                                          }
                                        >
                                          Reject
                                        </Button>
                                      </div>
                                    ))}
                                </div>
                              ))}
                            </section>
                          )}
                          <section
                            className="flex flex-col gap-2"
                            aria-label="Marks history"
                          >
                            <h2 className="text-base font-semibold">
                              Marks history
                            </h2>
                            <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                              {sheet.events.map((event) => (
                                <li
                                  key={event.id}
                                  className="flex flex-col gap-1 border-b py-2"
                                >
                                  <span>
                                    {labelFor(event.eventType)} ·{" "}
                                    {new Intl.DateTimeFormat("en-US", {
                                      timeZone: school?.timezone ?? "UTC",
                                      dateStyle: "medium",
                                      timeStyle: "short",
                                    }).format(parseISO(event.createdAt))}
                                  </span>
                                  {event.details.reason && (
                                    <span className="wrap-break-word">
                                      {event.details.reason}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </section>
                        </>
                      )}
                    </CardContent>
                  </Card>
                )
              )}
            </>
          )}
        </>
      )}
      <Dialog
        open={formOpen}
        disablePointerDismissal
        onOpenChange={(open) => {
          if (!busy) setFormOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-lg" showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>
              {form === "exam" ? "Create examination" : "Add assessment"}
            </DialogTitle>
            <DialogDescription>
              {form === "exam"
                ? "Choose a class and dates within its academic session."
                : "Configure a section, subject, and marks limits before opening the examination."}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Check this action</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submitForm(new FormData(event.currentTarget));
            }}
          >
            <fieldset disabled={busy} className="flex flex-col gap-4">
              <FieldGroup>
                {form === "exam" ? (
                  <>
                    <TextField label="Examination name" name="name" />
                    <Choice
                      label="Academic session"
                      value={sessionId}
                      options={setup?.academic.sessions ?? []}
                      onChange={(id) => {
                        setSessionId(id);
                        setClassId("");
                        setStartDate("");
                        setEndDate("");
                      }}
                    />
                    <Choice
                      label="Class"
                      value={classId}
                      options={
                        setup?.academic.classes.filter(
                          (item) => item.sessionId === sessionId,
                        ) ?? []
                      }
                      onChange={setClassId}
                      disabled={!sessionId}
                    />
                    <DateField
                      label="Start date"
                      value={startDate}
                      onChange={setStartDate}
                      min={session?.startDate}
                      max={session?.endDate}
                      disabled={!sessionId}
                    />
                    <DateField
                      label="End date"
                      value={endDate}
                      onChange={setEndDate}
                      min={startDate || session?.startDate}
                      max={session?.endDate}
                      disabled={!sessionId}
                    />
                  </>
                ) : (
                  <>
                    <TextField label="Assessment label" name="label" />
                    <Choice
                      label="Section"
                      value={sectionId}
                      options={
                        setup?.academic.sections.filter(
                          (item) => item.classId === exam?.classId,
                        ) ?? []
                      }
                      onChange={setSectionId}
                    />
                    <Choice
                      label="Subject"
                      value={subjectId}
                      options={
                        setup?.academic.subjects.filter(
                          (item) => item.sessionId === exam?.sessionId,
                        ) ?? []
                      }
                      onChange={setSubjectId}
                    />
                    <DateField
                      label="Assessment date"
                      value={assessmentDate}
                      onChange={setAssessmentDate}
                      min={exam?.startDate}
                      max={exam?.endDate}
                    />
                    <div className="grid gap-5 sm:grid-cols-2">
                      <TextField
                        label="Maximum marks"
                        name="maximum"
                        decimal
                        defaultValue="100"
                      />
                      <TextField
                        label="Passing marks"
                        name="passing"
                        decimal
                        defaultValue="35"
                      />
                    </div>
                  </>
                )}
              </FieldGroup>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setFormOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">
                  {busy
                    ? "Saving…"
                    : form === "exam"
                      ? "Create examination"
                      : "Add assessment"}
                </Button>
              </DialogFooter>
            </fieldset>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={actionOpen}
        onOpenChange={(open) => {
          if (!busy) setActionOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-lg" showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>{actionTitle}</DialogTitle>
            <DialogDescription>
              {action?.kind === "open"
                ? "Opening captures the enrolled students for every assessment date. Configuration becomes fixed."
                : action?.kind === "complete"
                  ? "Every marks sheet must be locked and pending corrections reviewed."
                  : action?.kind === "submit"
                    ? "Every student needs a score, absent, or exempt outcome. Save any changes before submitting."
                    : action?.kind === "lock"
                      ? "Locked marks can be changed through a correction reviewed by another authorized account."
                      : "Give a clear reason. The decision and marks changes are retained in history."}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Check this action</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void performAction();
            }}
          >
            <fieldset disabled={busy} className="flex flex-col gap-4">
              <FieldGroup>
                {action?.kind === "correction" && sheet && (
                  <MarkControl
                    name={action.mark.displayName}
                    value={proposal}
                    maximum={sheet.assessment.maximumScore}
                    onChange={setProposal}
                    complete
                    disabled={busy}
                  />
                )}
                {needsNote && (
                  <Field>
                    <FieldLabel htmlFor="examination-action-reason">
                      Reason
                    </FieldLabel>
                    <Textarea
                      id="examination-action-reason"
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      required
                      maxLength={1000}
                    />
                  </Field>
                )}
              </FieldGroup>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActionOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">{busy ? "Saving…" : "Confirm"}</Button>
              </DialogFooter>
            </fieldset>
          </form>
        </DialogContent>
      </Dialog>
    </PageStack>
  );
}
