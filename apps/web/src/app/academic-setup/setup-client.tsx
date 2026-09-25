"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BookOpen, CalendarDays, ChevronRight, GraduationCap, Plus, Users } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  activateAcademicSession, addAcademicAssignment, addAcademicClass, addAcademicSection, addAcademicSession, addAcademicSubject,
  getAcademicSetup, listAcademicSchools, listAcademicStaff,
  type AcademicSchool, type AcademicSetup, type AcademicStaffAccount,
} from "@/lib/academics-api";

function errorMessage(error: unknown) { return error instanceof Error ? error.message : "The request could not be completed"; }

function Choice({ label, value, onChange, options, placeholder }: {
  label: string; value: string; onChange: (value: string) => void;
  options: { id: string; name: string }[]; placeholder: string;
}) {
  return <Field>
    <FieldLabel>{label}</FieldLabel>
    <Select value={value || null} onValueChange={(next) => onChange(next ?? "")}>
      <SelectTrigger aria-label={label}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent><SelectGroup>
        {options.map((option) => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}
      </SelectGroup></SelectContent>
    </Select>
  </Field>;
}

function NamedForm({ title, description, onCreate, disabled }: {
  title: string; description: string; onCreate: (values: { name: string; code: string }) => Promise<boolean>; disabled: boolean;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const fieldPrefix = title.toLowerCase().replaceAll(" ", "-");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await onCreate({ name, code })) { setName(""); setCode(""); }
  }
  return <Card>
    <CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
    <CardContent>
      <form onSubmit={submit}><FieldGroup>
        <Field><FieldLabel htmlFor={`${fieldPrefix}-name`}>Name</FieldLabel><Input id={`${fieldPrefix}-name`} required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder={`e.g. ${title === "Add class" ? "Grade 1" : "Mathematics"}`} /></Field>
        <Field><FieldLabel htmlFor={`${fieldPrefix}-code`}>Code</FieldLabel><Input id={`${fieldPrefix}-code`} required maxLength={20} value={code} onChange={(event) => setCode(event.target.value)} placeholder="e.g. G1" /></Field>
        <Button disabled={disabled} type="submit"><Plus data-icon="inline-start" />{title}</Button>
      </FieldGroup></form>
    </CardContent>
  </Card>;
}

export function AcademicSetupClient() {
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

  useEffect(() => { listAcademicSchools().then((items) => { setSchools(items); setSchoolId(items[0]?.id ?? ""); }).catch((cause) => setError(errorMessage(cause))); }, []);
  const refresh = useCallback(async (id: string) => {
    const [result, members] = await Promise.all([getAcademicSetup(id), listAcademicStaff(id)]);
    setSetup(result); setStaff(members);
    setSessionId((current) => result.sessions.some((item) => item.id === current) ? current : result.sessions.find((item) => item.status === "active")?.id ?? result.sessions.find((item) => item.status === "draft")?.id ?? "");
  }, []);
  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;
    Promise.all([getAcademicSetup(schoolId), listAcademicStaff(schoolId)]).then(([result, members]) => {
      if (cancelled) return;
      setSetup(result); setStaff(members);
      setSessionId(result.sessions.find((item) => item.status === "active")?.id ?? result.sessions.find((item) => item.status === "draft")?.id ?? "");
      setClassId(""); setSectionId(""); setSubjectId(""); setMembershipId("");
    }).catch((cause) => { if (!cancelled) setError(errorMessage(cause)); });
    return () => { cancelled = true; };
  }, [schoolId]);

  const session = setup?.sessions.find((item) => item.id === sessionId);
  const classes = setup?.classes.filter((item) => item.sessionId === sessionId) ?? [];
  const sections = setup?.sections.filter((item) => item.sessionId === sessionId) ?? [];
  const subjects = setup?.subjects.filter((item) => item.sessionId === sessionId) ?? [];
  const assignments = setup?.assignments.filter((item) => item.sessionId === sessionId) ?? [];
  const editable = Boolean(session && session.status !== "archived");

  async function mutate(work: () => Promise<unknown>, message: string) {
    if (!schoolId) return false;
    setBusy(true); setError(""); setNotice("");
    try { await work(); await refresh(schoolId); setNotice(message); return true; }
    catch (cause) { setError(errorMessage(cause)); return false; }
    finally { setBusy(false); }
  }

  return <div className="flex flex-col gap-6">
    <div className="page-heading">
      <div><div className="breadcrumb"><span>Academic</span><ChevronRight size={14} /><strong>School setup</strong></div>
        <h1>Academic setup</h1><p>Configure sessions, classes, sections, subjects and teaching assignments.</p></div>
      <Badge variant="secondary">PHASE 4</Badge>
    </div>
    {error && <Alert variant="destructive"><AlertTitle>Could not complete the request</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {notice && <Alert><AlertTitle>Saved</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert>}
    {schools.length === 0 && !error && <Alert><AlertTitle>No schools available</AlertTitle><AlertDescription>Choose a workspace with access to a school to set up academics.</AlertDescription></Alert>}
    {schools.length > 0 && <Card><CardHeader><CardTitle>School and academic session</CardTitle><CardDescription>Choose a school and the session to configure.</CardDescription></CardHeader>
      <CardContent><div className="grid gap-4 md:grid-cols-2">
        <Choice label="School" value={schoolId} onChange={setSchoolId} options={schools.map((item) => ({ id: item.id, name: item.name }))} placeholder="Select school" />
        <Choice label="Academic session" value={sessionId} onChange={setSessionId} options={(setup?.sessions ?? []).map((item) => ({ id: item.id, name: `${item.name} · ${item.status}` }))} placeholder="Create a session" />
      </div></CardContent></Card>}
    {schoolId && <div className="grid gap-5 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>New academic session</CardTitle><CardDescription>Set the calendar dates for a school year.</CardDescription></CardHeader>
        <CardContent><form onSubmit={async (event) => { event.preventDefault(); const element = event.currentTarget; const form = new FormData(element); const saved = await mutate(() => addAcademicSession(schoolId, {
          name: String(form.get("name")), code: String(form.get("code")), startDate: String(form.get("startDate")), endDate: String(form.get("endDate")),
        }), "Academic session created"); if (saved) element.reset(); }}><FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="session-name">Session name</FieldLabel><Input id="session-name" name="name" required placeholder="2026–27" /></Field><Field><FieldLabel htmlFor="session-code">Code</FieldLabel><Input id="session-code" name="code" required placeholder="2026" /></Field></div>
          <div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="start-date">Start date</FieldLabel><Input id="start-date" name="startDate" type="date" required /></Field><Field><FieldLabel htmlFor="end-date">End date</FieldLabel><Input id="end-date" name="endDate" type="date" required /></Field></div>
          <Button type="submit" disabled={busy}><CalendarDays data-icon="inline-start" />Create session</Button>
        </FieldGroup></form></CardContent>
      </Card>
      <Card><CardHeader><CardTitle>Session status</CardTitle><CardDescription>Only one academic session is active per school.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-4">
          {session ? <><div className="flex items-center justify-between rounded-lg border p-4"><div><strong className="text-base">{session.name}</strong><p className="text-muted-foreground">{session.startDate} to {session.endDate}</p></div><Badge variant={session.status === "active" ? "default" : "secondary"}>{session.status}</Badge></div>
            {session.status === "draft" && <Button disabled={busy || !classes.length || !sections.length || !subjects.length} onClick={() => { if (window.confirm(`Activate ${session.name}? The current active session will be archived.`)) void mutate(() => activateAcademicSession(schoolId, session.id), "Academic session activated"); }}>Activate session</Button>}
            {session.status === "draft" && (!classes.length || !sections.length || !subjects.length) && <p className="text-sm text-muted-foreground">Add at least one class, section, and subject to activate.</p>}
          </> : <p className="text-sm text-muted-foreground">Create a session to begin academic setup.</p>}
        </CardContent>
      </Card>
    </div>}
    {session && <>
      <div className="grid gap-5 lg:grid-cols-2">
        <NamedForm title="Add class" description="Create a grade or class for this session." disabled={busy || !editable} onCreate={(input) => mutate(() => addAcademicClass(schoolId, sessionId, input), "Class created")} />
        <NamedForm title="Add subject" description="Subjects can be assigned to class sections." disabled={busy || !editable} onCreate={(input) => mutate(() => addAcademicSubject(schoolId, sessionId, input), "Subject created")} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Add section</CardTitle><CardDescription>Choose the class this section belongs to.</CardDescription></CardHeader><CardContent>
          <form onSubmit={async (event) => { event.preventDefault(); const element = event.currentTarget; const form = new FormData(element); const saved = await mutate(() => addAcademicSection(schoolId, classId, { name: String(form.get("name")), code: String(form.get("code")), ...(form.get("capacity") ? { capacity: Number(form.get("capacity")) } : {}) }), "Section created"); if (saved) element.reset(); }}><FieldGroup>
            <Choice label="Class" value={classId} onChange={setClassId} options={classes} placeholder="Select class" />
            <div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="section-name">Section name</FieldLabel><Input id="section-name" name="name" required placeholder="Section A" /></Field><Field><FieldLabel htmlFor="section-code">Code</FieldLabel><Input id="section-code" name="code" required placeholder="A" /></Field></div>
            <Field><FieldLabel htmlFor="section-capacity">Capacity (optional)</FieldLabel><Input id="section-capacity" name="capacity" type="number" min={1} max={1000} /></Field>
            <Button type="submit" disabled={busy || !editable || !classId}><Plus data-icon="inline-start" />Add section</Button>
          </FieldGroup></form>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Assign teacher</CardTitle><CardDescription>Link an active account to a section and subject. Staff profiles arrive in Phase 5.</CardDescription></CardHeader><CardContent><FieldGroup>
          <Choice label="Section" value={sectionId} onChange={setSectionId} options={sections.map((item) => ({ id: item.id, name: `${classes.find((klass) => klass.id === item.classId)?.name ?? "Class"} · ${item.name}` }))} placeholder="Select section" />
          <Choice label="Subject" value={subjectId} onChange={setSubjectId} options={subjects} placeholder="Select subject" />
          <Choice label="Active account" value={membershipId} onChange={setMembershipId} options={staff.map((item) => ({ id: item.id, name: item.displayName ? `${item.displayName} (${item.email})` : item.email }))} placeholder="Select account" />
          <Button disabled={busy || !editable || !sectionId || !subjectId || !membershipId} onClick={() => void mutate(() => addAcademicAssignment(schoolId, sectionId, { subjectId, membershipId }), "Teacher assigned")}><Users data-icon="inline-start" />Assign teacher</Button>
        </FieldGroup></CardContent></Card>
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <Card><CardHeader><CardTitle><GraduationCap className="inline size-4" /> Classes & sections</CardTitle><CardDescription>{classes.length} classes · {sections.length} sections</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Class</TableHead><TableHead>Sections</TableHead></TableRow></TableHeader><TableBody>{classes.map((item) => <TableRow key={item.id}><TableCell>{item.name} <span className="text-muted-foreground">({item.code})</span></TableCell><TableCell>{sections.filter((section) => section.classId === item.id).map((section) => section.name).join(", ") || "—"}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
        <Card><CardHeader><CardTitle><BookOpen className="inline size-4" /> Subjects</CardTitle><CardDescription>{subjects.length} subjects in this session</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Code</TableHead></TableRow></TableHeader><TableBody>{subjects.map((item) => <TableRow key={item.id}><TableCell>{item.name}</TableCell><TableCell>{item.code}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
        <Card><CardHeader><CardTitle><Users className="inline size-4" /> Teacher assignments</CardTitle><CardDescription>{assignments.length} section subject assignments</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Section / subject</TableHead><TableHead>Account</TableHead></TableRow></TableHeader><TableBody>{assignments.map((item) => <TableRow key={item.id}><TableCell>{sections.find((section) => section.id === item.sectionId)?.name ?? "Section"} / {subjects.find((subject) => subject.id === item.subjectId)?.name ?? "Subject"}</TableCell><TableCell>{staff.find((member) => member.id === item.membershipId)?.displayName ?? staff.find((member) => member.id === item.membershipId)?.email ?? "Account"}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
      </div>
    </>}
  </div>;
}
