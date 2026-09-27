"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { ChevronRight, FileCheck2, FileUp, LoaderCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { ApiRequestError } from "@/lib/api-error";
import { commitStudentImport, inspectStudentImport, previewStudentImport, STUDENT_CSV_MAX_BYTES, type StudentCsvMapping, type StudentImportError, type StudentImportInspection, type StudentImportPreview, type StudentImportResult } from "@/lib/student-import-api";
import { listPeopleSchools, type PeopleSchool } from "@/lib/students-api";
import { ColumnMapping, inferStudentMapping, validateStudentMapping } from "./column-mapping";
import { ImportPreview } from "./import-preview";

const stepNames = ["Upload", "Map columns", "Preview and fix", "Import result"] as const;
const fileError = (file: File): string | null => {
  if (!file.name.toLowerCase().endsWith(".csv")) return "Choose a .csv file";
  if (!file.size) return "Choose a non-empty CSV file";
  if (file.size > STUDENT_CSV_MAX_BYTES) return "The CSV file must be 2 MiB or smaller";
  return null;
};

export function StudentImportClient() {
  const [schools, setSchools] = useState<PeopleSchool[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [inspection, setInspection] = useState<StudentImportInspection | null>(null);
  const [mapping, setMapping] = useState<StudentCsvMapping>({});
  const [preview, setPreview] = useState<StudentImportPreview | null>(null);
  const [result, setResult] = useState<StudentImportResult | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [busy, setBusy] = useState(false);
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [error, setError] = useState("");
  const [mappingErrors, setMappingErrors] = useState<string[]>([]);
  const schoolSelectId = useId();

  useEffect(() => {
    let cancelled = false;
    listPeopleSchools().then((items) => {
      if (cancelled) return;
      const manageable = items.filter((item) => item.canManageStudents && item.canManageGuardians && item.canManageEnrollment);
      setSchools(manageable);
      const requested = new URLSearchParams(window.location.search).get("school");
      setSchoolId(manageable.find((item) => item.id === requested)?.id ?? manageable[0]?.id ?? "");
    }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Schools could not be loaded"); })
      .finally(() => { if (!cancelled) setLoadingSchools(false); });
    return () => { cancelled = true; };
  }, []);

  function reset(nextFile: File | null = null, clearInput = true) {
    if (clearInput) setFileInputKey((current) => current + 1);
    setFile(nextFile); setInspection(null); setMapping({}); setPreview(null); setResult(null);
    setIdempotencyKey(""); setStep(0); setMappingErrors([]); setError("");
  }
  function onFile(nextFile: File | null) {
    reset(null, false);
    if (!nextFile) return;
    const issue = fileError(nextFile);
    if (issue) { setError(issue); setFileInputKey((current) => current + 1); return; }
    setFile(nextFile);
  }
  async function inspect() {
    if (!schoolId || !file) return;
    setBusy(true); setError("");
    try {
      const inspected = await inspectStudentImport(schoolId, file);
      setInspection(inspected); setMapping(inferStudentMapping(inspected.headers)); setStep(1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The CSV could not be inspected"); }
    finally { setBusy(false); }
  }
  async function previewRows() {
    if (!schoolId || !file || !inspection) return;
    const issues = validateStudentMapping(inspection.headers, mapping);
    setMappingErrors(issues);
    if (issues.length) return;
    setBusy(true); setError("");
    try {
      const next = await previewStudentImport(schoolId, file, mapping);
      setPreview(next); setIdempotencyKey(crypto.randomUUID()); setStep(2);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The CSV could not be previewed"); }
    finally { setBusy(false); }
  }
  async function commit() {
    if (!schoolId || !file || !preview || preview.errors.length) return;
    const key = idempotencyKey || crypto.randomUUID();
    if (!idempotencyKey) setIdempotencyKey(key);
    setBusy(true); setError("");
    try {
      const saved = await commitStudentImport(schoolId, file, mapping, key);
      setResult(saved); setStep(3);
      toast.add({ type: "success", title: "Student import complete", description: `${saved.studentCount} students and ${saved.guardianCount} guardians processed.` });
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "The import could not be committed";
      if (cause instanceof ApiRequestError && cause.rows.length) setPreview((current) => current ? { ...current, errors: cause.rows.map((row) => ({ ...row, field: row.field as StudentImportError["field"] })) } : current);
      setError(detail);
      toast.add({ type: "error", title: "Student import failed", description: detail, priority: "high" });
    } finally { setBusy(false); }
  }

  return <div className="flex flex-col gap-6"><div className="page-heading"><div><div className="breadcrumb"><Link href={`/students?school=${schoolId}`}>Students</Link><ChevronRight size={14} /><strong>Import CSV</strong></div><h1>Import students</h1><p>Inspect, map, and preview every row before saving it to the selected school.</p></div></div>
    <Card><CardContent className="flex flex-col gap-3 py-5"><ol className="grid gap-2 text-sm sm:grid-cols-4">{stepNames.map((name, index) => <li key={name} className={`rounded-md border px-3 py-2 ${index === step ? "border-primary bg-primary/5 font-semibold text-foreground" : "text-muted-foreground"}`} aria-current={index === step ? "step" : undefined}>{index + 1}. {name}</li>)}</ol><Progress value={(step + 1) * 25} aria-label="Import progress" /></CardContent></Card>
    {error && <Alert variant="destructive"><AlertTitle>Import needs attention</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {loadingSchools ? <Skeleton className="h-72 w-full" /> : schools.length === 0 ? <Alert><AlertTitle>No school available for imports</AlertTitle><AlertDescription>You need student, guardian, and enrollment management access at a school.</AlertDescription></Alert> : <>
      {step === 0 && <Card><CardHeader><CardTitle>Upload CSV</CardTitle><CardDescription>UTF-8, comma-delimited, up to 2 MiB and 1,000 data rows. The file stays in this browser until you commit.</CardDescription></CardHeader><CardContent className="flex flex-col gap-5"><Field><FieldLabel htmlFor={schoolSelectId}>School</FieldLabel><Select items={schools.map((item) => ({ label: item.name, value: item.id }))} value={schoolId || null} onValueChange={(value) => { setSchoolId(value ?? ""); reset(); }}><SelectTrigger id={schoolSelectId} className="max-w-md"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{schools.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
        <Field><FieldLabel htmlFor="student-import-file">CSV file</FieldLabel><Input key={fileInputKey} id="student-import-file" type="file" accept=".csv,text/csv" onChange={(event) => onFile(event.target.files?.[0] ?? null)} className="max-w-xl" /></Field>
        <Button className="w-fit" disabled={!file || busy} onClick={() => void inspect()}>{busy ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <FileUp data-icon="inline-start" />}{busy ? "Inspecting…" : "Inspect file"}</Button>
      </CardContent></Card>}
      {step === 1 && inspection && <Card><CardHeader><CardTitle>Map columns</CardTitle><CardDescription>{inspection.rowCount} rows detected. Match CSV headers to student, placement, and optional guardian fields. Each source column can be used once.</CardDescription></CardHeader><CardContent className="flex flex-col gap-6">
        {mappingErrors.length > 0 && <Alert variant="destructive"><AlertTitle>Complete the mapping</AlertTitle><AlertDescription><ul className="list-disc pl-5">{mappingErrors.map((issue) => <li key={issue}>{issue}</li>)}</ul></AlertDescription></Alert>}
        <ColumnMapping headers={inspection.headers} mapping={mapping} onChange={(next) => { setMapping(next); setMappingErrors([]); setPreview(null); setIdempotencyKey(""); }} />
        {inspection.sampleRows.length > 0 && <div><h3 className="mb-2 font-semibold text-foreground">Sample values</h3><div className="overflow-x-auto rounded-lg border p-3 text-sm"><pre className="whitespace-pre-wrap">{JSON.stringify(inspection.sampleRows.slice(0, 3), null, 2)}</pre></div></div>}
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setStep(0)}>Back to upload</Button><Button disabled={busy} onClick={() => void previewRows()}>{busy ? "Previewing…" : "Preview rows"}</Button></div>
      </CardContent></Card>}
      {step === 2 && preview && <Card><CardHeader><CardTitle>Preview and fix</CardTitle><CardDescription>Import is available only when every row passes validation.</CardDescription></CardHeader><CardContent className="flex flex-col gap-5"><ImportPreview preview={preview} /><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { setStep(1); setPreview(null); setIdempotencyKey(""); }}>Change mapping</Button><Button variant="outline" onClick={() => reset()}>Choose another file</Button><Button disabled={busy || preview.errors.length > 0} onClick={() => void commit()}>{busy ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <FileCheck2 data-icon="inline-start" />}{busy ? "Importing…" : "Import students"}</Button></div></CardContent></Card>}
      {step === 3 && result && <Card><CardHeader><CardTitle>Import complete</CardTitle><CardDescription>The batch was committed as one transaction.</CardDescription></CardHeader><CardContent className="flex flex-col gap-5"><div className="grid gap-3 sm:grid-cols-3">{[["Students", result.studentCount], ["Guardians", result.guardianCount], ["Enrollments", result.enrollmentCount]].map(([label, count]) => <div key={label} className="rounded-lg border p-4"><strong className="text-xl text-foreground">{count}</strong><p className="text-sm text-muted-foreground">{label}</p></div>)}</div>{result.replayed && <Badge variant="secondary" className="w-fit">Safe retry: previous result reused</Badge>}<p className="text-sm text-muted-foreground">Batch {result.batchId}</p><div className="flex flex-wrap gap-2"><Button nativeButton={false} render={<Link href={`/students?school=${schoolId}`} />}>View students</Button><Button variant="outline" onClick={() => reset()}>Import another file</Button></div></CardContent></Card>}
    </>}
  </div>;
}
