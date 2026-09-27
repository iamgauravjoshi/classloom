"use client";

import { useState, type FormEvent } from "react";
import { ArrowRightLeft, CheckCircle2, Plus, UserRoundX } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AcademicSetup } from "@/lib/academics-api";
import { completeAcademicEnrollment, createAcademicEnrollment, createSchoolEnrollment, transferAcademicEnrollment, withdrawAcademicEnrollment, type AcademicEnrollment, type SchoolEnrollment } from "@/lib/enrollment-api";
import { DateField } from "../../academic-setup/date-field";

type Group = { school: SchoolEnrollment; academics: AcademicEnrollment[] };
type Action = { kind: "readmit" | "place" | "transfer" | "withdraw" | "complete"; schoolEnrollmentId?: string; enrollmentId?: string };

export function StudentEnrollmentPanel({ schoolId, studentId, groups, setup, canManage, busy, onMutate }: {
  schoolId: string; studentId: string; groups: Group[]; setup: AcademicSetup | null; canManage: boolean; busy: boolean;
  onMutate: (action: () => Promise<unknown>, success: string) => Promise<void>;
}) {
  const [action, setAction] = useState<Action | null>(null);
  const [date, setDate] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [error, setError] = useState("");
  const classes = setup?.classes.filter((item) => item.sessionId === sessionId) ?? [];
  const sections = setup?.sections.filter((item) => item.classId === classId) ?? [];
  const activeSchool = groups.find((item) => item.school.status === "active");

  function open(next: Action) {
    setAction(next); setDate(""); setSessionId(""); setClassId(""); setSectionId(""); setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) ?? "").trim();
    if (!date) { setError("Choose an effective date"); return; }
    if (["place", "transfer"].includes(action.kind) && (!sessionId || !classId || !sectionId)) { setError("Choose a session, class, and section"); return; }
    try {
      if (action.kind === "readmit") await onMutate(() => createSchoolEnrollment(schoolId, studentId, { admissionNumber: value("admissionNumber"), admissionDate: date }), "School admission created");
      if (action.kind === "place") await onMutate(() => createAcademicEnrollment(schoolId, action.schoolEnrollmentId!, { sessionId, classId, sectionId, rollNumber: value("rollNumber") || null, startDate: date }), "Academic placement created");
      if (action.kind === "transfer") await onMutate(() => transferAcademicEnrollment(schoolId, action.enrollmentId!, { sessionId, classId, sectionId, rollNumber: value("rollNumber") || null, effectiveDate: date, reason: value("reason") || null }), "Academic placement transferred");
      if (action.kind === "withdraw") await onMutate(() => withdrawAcademicEnrollment(schoolId, action.enrollmentId!, { effectiveDate: date, reason: value("reason") || null }), "Academic placement withdrawn");
      if (action.kind === "complete") await onMutate(() => completeAcademicEnrollment(schoolId, action.enrollmentId!, { effectiveDate: date, reason: value("reason") || null }), "Academic placement completed");
      setAction(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Enrollment could not be changed"); }
  }

  const academicName = (record: AcademicEnrollment) => {
    const session = setup?.sessions.find((item) => item.id === record.sessionId)?.name ?? "Session";
    const schoolClass = setup?.classes.find((item) => item.id === record.classId)?.name ?? "Class";
    const section = setup?.sections.find((item) => item.id === record.sectionId)?.name ?? "Section";
    return `${session} · ${schoolClass} · ${section}`;
  };

  return <div className="flex flex-col gap-5">
    {canManage && !activeSchool && <Button variant="outline" className="w-fit" onClick={() => open({ kind: "readmit" })}><Plus data-icon="inline-start" />Add school admission</Button>}
    {groups.length === 0 ? <Empty><EmptyHeader><EmptyTitle>No enrollment history</EmptyTitle><EmptyDescription>Admit this student to begin a school record.</EmptyDescription></EmptyHeader></Empty> : groups.map((group) => <Card key={group.school.id}><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>Admission {group.school.admissionNumber}</CardTitle><CardDescription>Admitted {group.school.admissionDate}{group.school.leavingDate ? ` · Left ${group.school.leavingDate}` : ""}</CardDescription></div><Badge variant={group.school.status === "active" ? "default" : "secondary"}>{group.school.status}</Badge></div></CardHeader><CardContent className="flex flex-col gap-4">
      {group.academics.length ? group.academics.map((record) => <div key={record.id} className="rounded-lg border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium text-foreground">{academicName(record)}</p><p className="text-sm text-muted-foreground">{record.startDate}{record.endDate ? ` to ${record.endDate}` : " onward"}{record.rollNumber ? ` · Roll ${record.rollNumber}` : ""}</p>{record.reason && <p className="mt-1 text-sm text-foreground">{record.reason}</p>}</div><Badge variant={record.status === "active" ? "default" : "secondary"}>{record.status}</Badge></div>
        {canManage && record.status === "active" && <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => open({ kind: "transfer", enrollmentId: record.id })}><ArrowRightLeft data-icon="inline-start" />Transfer</Button><Button size="sm" variant="outline" onClick={() => open({ kind: "withdraw", enrollmentId: record.id })}><UserRoundX data-icon="inline-start" />Withdraw</Button><Button size="sm" variant="outline" onClick={() => open({ kind: "complete", enrollmentId: record.id })}><CheckCircle2 data-icon="inline-start" />Complete</Button></div>}
      </div>) : <p className="text-sm text-muted-foreground">No academic placement recorded for this admission.</p>}
      {canManage && group.school.status === "active" && !group.academics.some((record) => record.status === "active") && <Button variant="outline" className="w-fit" onClick={() => open({ kind: "place", schoolEnrollmentId: group.school.id })}><Plus data-icon="inline-start" />Add academic placement</Button>}
    </CardContent></Card>)}
    <Dialog open={Boolean(action)} onOpenChange={(open) => { if (!open) setAction(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>{action?.kind === "readmit" ? "Create school admission" : action?.kind === "place" ? "Add academic placement" : action?.kind === "transfer" ? "Transfer academic placement" : action?.kind === "withdraw" ? "Withdraw student" : "Complete placement"}</DialogTitle><DialogDescription>{action?.kind === "withdraw" || action?.kind === "complete" ? "This closes the active academic placement and keeps its history." : "The new placement must match an active academic session, class, and section."}</DialogDescription></DialogHeader>
      {error && <Alert variant="destructive"><AlertTitle>Check enrollment details</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      <form onSubmit={(event) => void submit(event)}><FieldGroup>
        {action?.kind === "readmit" && <Field><FieldLabel htmlFor="enrollment-admission-number">Admission number</FieldLabel><Input id="enrollment-admission-number" name="admissionNumber" required maxLength={40} /></Field>}
        <DateField id="enrollment-effective-date" label={action?.kind === "readmit" ? "Admission date" : action?.kind === "place" ? "Placement start date" : "Effective date"} value={date} onChange={setDate} />
        {(action?.kind === "place" || action?.kind === "transfer") && <>
          <Field><FieldLabel htmlFor="enrollment-session">Session</FieldLabel><Select items={(setup?.sessions ?? []).map((item) => ({ label: item.name, value: item.id }))} value={sessionId || null} onValueChange={(next) => { setSessionId(next ?? ""); setClassId(""); setSectionId(""); }}><SelectTrigger id="enrollment-session" className="w-full"><SelectValue placeholder="Choose session" /></SelectTrigger><SelectContent><SelectGroup>{setup?.sessions.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
          <Field><FieldLabel htmlFor="enrollment-class">Class</FieldLabel><Select items={classes.map((item) => ({ label: item.name, value: item.id }))} value={classId || null} onValueChange={(next) => { setClassId(next ?? ""); setSectionId(""); }}><SelectTrigger id="enrollment-class" className="w-full"><SelectValue placeholder="Choose class" /></SelectTrigger><SelectContent><SelectGroup>{classes.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
          <Field><FieldLabel htmlFor="enrollment-section">Section</FieldLabel><Select items={sections.map((item) => ({ label: item.name, value: item.id }))} value={sectionId || null} onValueChange={(next) => setSectionId(next ?? "")}><SelectTrigger id="enrollment-section" className="w-full"><SelectValue placeholder="Choose section" /></SelectTrigger><SelectContent><SelectGroup>{sections.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
          <Field><FieldLabel htmlFor="enrollment-roll-number">Roll number (optional)</FieldLabel><Input id="enrollment-roll-number" name="rollNumber" maxLength={40} /></Field>
        </>}
        {(action?.kind === "transfer" || action?.kind === "withdraw" || action?.kind === "complete") && <Field><FieldLabel htmlFor="enrollment-reason">Reason (optional)</FieldLabel><Textarea id="enrollment-reason" name="reason" maxLength={500} /></Field>}
        <DialogFooter><Button type="button" variant="outline" onClick={() => setAction(null)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Confirm"}</Button></DialogFooter>
      </FieldGroup></form>
    </DialogContent></Dialog>
  </div>;
}
