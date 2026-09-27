"use client";

import { useDeferredValue, useEffect, useId, useState } from "react";
import Link from "next/link";
import { ChevronRight, FileUp, Plus, Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAcademicSetup, type AcademicSetup } from "@/lib/academics-api";
import { listPeopleSchools, listStudents, type Page, type PeopleSchool, type Student } from "@/lib/students-api";

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Student details could not be loaded.";

function DirectorySelect({ id, label, value, options, onChange, allLabel }: {
  id: string; label: string; value: string; options: { id: string; name: string }[];
  onChange: (value: string) => void; allLabel?: string;
}) {
  const items = [...(allLabel ? [{ label: allLabel, value: "__all__" }] : []), ...options.map((option) => ({ label: option.name, value: option.id }))];
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Select items={items} value={value || (allLabel ? "__all__" : null)} onValueChange={(next) => onChange(next === "__all__" ? "" : next ?? "")}>
      <SelectTrigger id={id} className="w-full"><SelectValue placeholder={allLabel ?? "Choose"} /></SelectTrigger>
      <SelectContent><SelectGroup>{allLabel && <SelectItem value="__all__">{allLabel}</SelectItem>}{options.map((option) => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>
  </Field>;
}

export function StudentsClient() {
  const [schools, setSchools] = useState<PeopleSchool[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [setup, setSetup] = useState<AcademicSetup | null>(null);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [status, setStatus] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors.at(-1) ?? "";
  const [page, setPage] = useState<Page<Student> | null>(null);
  const [pageKey, setPageKey] = useState("");
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [error, setError] = useState("");
  const schoolSelectId = useId();
  const statusSelectId = useId();
  const sessionSelectId = useId();
  const classSelectId = useId();
  const sectionSelectId = useId();
  const key = `${schoolId}|${deferredQuery}|${status}|${sessionId}|${classId}|${sectionId}|${cursor}`;
  const loadingPage = schoolId && pageKey !== key;
  const selectedSchool = schools.find((school) => school.id === schoolId);
  const sessions = setup?.sessions ?? [];
  const classes = setup?.classes.filter((item) => item.sessionId === sessionId) ?? [];
  const sections = setup?.sections.filter((item) => item.classId === classId) ?? [];

  useEffect(() => {
    let cancelled = false;
    listPeopleSchools().then((items) => {
      if (cancelled) return;
      const readable = items.filter((item) => item.canReadStudents);
      setSchools(readable);
      const requested = new URLSearchParams(window.location.search).get("school");
      setSchoolId(readable.find((item) => item.id === requested)?.id ?? readable[0]?.id ?? "");
    }).catch((cause) => { if (!cancelled) setError(errorMessage(cause)); })
      .finally(() => { if (!cancelled) setLoadingSchools(false); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;
    getAcademicSetup(schoolId).then((value) => { if (!cancelled) setSetup(value); })
      .catch(() => { if (!cancelled) setSetup(null); });
    return () => { cancelled = true; };
  }, [schoolId]);
  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;
    listStudents(schoolId, {
      q: deferredQuery || undefined, status: status as "active" | "inactive" || undefined,
      sessionId: sessionId || undefined, classId: classId || undefined, sectionId: sectionId || undefined,
      cursor: cursor || undefined,
    }).then((result) => { if (!cancelled) { setPage(result); setPageKey(key); setError(""); } })
      .catch((cause) => { if (!cancelled) { setPage(null); setPageKey(key); setError(errorMessage(cause)); } });
    return () => { cancelled = true; };
  }, [schoolId, deferredQuery, status, sessionId, classId, sectionId, cursor, key]);

  function resetSchool(next: string) {
    setSchoolId(next); setQuery(""); setStatus(""); setSessionId(""); setClassId(""); setSectionId("");
    setCursors([]); setPage(null); setSetup(null);
  }
  function resetCursor() { setCursors([]); }

  return <div className="flex flex-col gap-6">
    <div className="page-heading"><div><div className="breadcrumb"><span>School management</span><ChevronRight size={14} /><strong>Students</strong></div><h1>Students</h1><p>Find students, review their enrollment, and manage guardian connections.</p></div>
      {selectedSchool?.canManageStudents && <div className="flex flex-wrap gap-2">
        <Button variant="outline" nativeButton={false} render={<Link href={`/students/import?school=${schoolId}`} />} disabled={!selectedSchool.canManageEnrollment}><FileUp data-icon="inline-start" />Import CSV</Button>
        <Button nativeButton={false} render={<Link href={`/students/new?school=${schoolId}`} />} disabled={!selectedSchool.canManageEnrollment}><Plus data-icon="inline-start" />Add student</Button>
      </div>}</div>
    {error && <Alert variant="destructive"><AlertTitle>Could not load students</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {loadingSchools ? <Skeleton className="h-64 w-full" /> : schools.length === 0 ? <Alert><AlertTitle>No accessible schools</AlertTitle><AlertDescription>Your workspace does not have student directory access at a school.</AlertDescription></Alert> : <Card>
      <CardHeader><CardTitle>Student directory</CardTitle><CardDescription>Search by name or student code. Filters apply to the selected school.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <DirectorySelect id={schoolSelectId} label="School" value={schoolId} options={schools} onChange={resetSchool} />
          <Field><FieldLabel htmlFor="student-search">Search students</FieldLabel><div className="relative"><Search aria-hidden="true" className="absolute left-2 top-2 size-4 text-muted-foreground" /><Input id="student-search" className="pl-8" value={query} onChange={(event) => { setQuery(event.target.value); resetCursor(); }} placeholder="Name or code" /></div></Field>
          <DirectorySelect id={statusSelectId} label="Status" value={status} allLabel="All statuses" options={[{ id: "active", name: "Active" }, { id: "inactive", name: "Inactive" }]} onChange={(value) => { setStatus(value); resetCursor(); }} />
          <DirectorySelect id={sessionSelectId} label="Session" value={sessionId} allLabel="All sessions" options={sessions.map((item) => ({ id: item.id, name: item.name }))} onChange={(value) => { setSessionId(value); setClassId(""); setSectionId(""); resetCursor(); }} />
          <DirectorySelect id={classSelectId} label="Class" value={classId} allLabel="All classes" options={classes.map((item) => ({ id: item.id, name: item.name }))} onChange={(value) => { setClassId(value); setSectionId(""); resetCursor(); }} />
          <DirectorySelect id={sectionSelectId} label="Section" value={sectionId} allLabel="All sections" options={sections.map((item) => ({ id: item.id, name: item.name }))} onChange={(value) => { setSectionId(value); resetCursor(); }} />
        </div>
        {loadingPage ? <Skeleton className="h-48 w-full" aria-label="Loading students" /> : page?.items.length ? <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Code</TableHead><TableHead>Date of birth</TableHead><TableHead>Status</TableHead><TableHead><span className="sr-only">Profile</span></TableHead></TableRow></TableHeader><TableBody>
          {page.items.map((student) => <TableRow key={student.id}><TableCell><Link href={`/students/${student.id}?school=${schoolId}`} className="flex items-center gap-3 font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"><Avatar size="sm"><AvatarFallback>{(student.preferredName || student.givenName || "S").slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>{student.preferredName || student.givenName || "Unknown student"} {student.familyName}</Link></TableCell><TableCell>{student.studentCode}</TableCell><TableCell>{student.dateOfBirth}</TableCell><TableCell><Badge variant={student.status === "active" ? "default" : "secondary"}>{student.status}</Badge></TableCell><TableCell><Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/students/${student.id}?school=${schoolId}`} />}>View</Button></TableCell></TableRow>)}
        </TableBody></Table></div> : !error && <Empty><EmptyHeader><EmptyTitle>No students found</EmptyTitle><EmptyDescription>Try another search or filter, or add the first student.</EmptyDescription></EmptyHeader><EmptyContent>{selectedSchool?.canManageStudents && <Button nativeButton={false} render={<Link href={`/students/new?school=${schoolId}`} />}>Add student</Button>}</EmptyContent></Empty>}
        {!loadingPage && (cursors.length > 0 || page?.nextCursor) && <Pagination><PaginationContent><PaginationItem><Button variant="outline" disabled={cursors.length === 0} onClick={() => setCursors((current) => current.slice(0, -1))}>Previous</Button></PaginationItem><PaginationItem><span className="px-3 text-sm text-foreground">Page {cursors.length + 1}</span></PaginationItem><PaginationItem><Button variant="outline" disabled={!page?.nextCursor} onClick={() => { if (page?.nextCursor) setCursors((current) => [...current, page.nextCursor!]); }}>Next</Button></PaginationItem></PaginationContent></Pagination>}
      </CardContent>
    </Card>}
  </div>;
}
