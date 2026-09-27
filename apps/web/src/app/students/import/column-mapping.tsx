"use client";

import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STUDENT_CSV_FIELDS, STUDENT_CSV_GUARDIAN_REQUIRED_FIELDS, STUDENT_CSV_REQUIRED_FIELDS, type StudentCsvField, type StudentCsvMapping } from "@/lib/student-import-api";

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
export const studentFieldLabel = (field: StudentCsvField) => field.replace(/([A-Z])/g, " $1").toLowerCase().replace(/^./, (letter) => letter.toUpperCase());

export function inferStudentMapping(headers: string[]): StudentCsvMapping {
  const mapping: StudentCsvMapping = {};
  const used = new Set<string>();
  for (const field of STUDENT_CSV_FIELDS) {
    const match = headers.find((header) => normalize(header) === normalize(field) && !used.has(header));
    if (match) { mapping[field] = match; used.add(match); }
  }
  return mapping;
}

export function validateStudentMapping(headers: string[], mapping: StudentCsvMapping): string[] {
  const errors: string[] = [];
  for (const field of STUDENT_CSV_REQUIRED_FIELDS) if (!mapping[field]) errors.push(`Map ${studentFieldLabel(field)}`);
  const values = Object.values(mapping).filter((value): value is string => Boolean(value));
  if (new Set(values).size !== values.length) errors.push("Use each CSV column only once");
  if (values.some((value) => !headers.includes(value))) errors.push("A mapped column is missing from this file");
  const guardianMapped = (Object.keys(mapping) as StudentCsvField[]).some((field) => Boolean(mapping[field]) && (field.startsWith("guardian") || field === "relationshipType"));
  if (guardianMapped) for (const field of STUDENT_CSV_GUARDIAN_REQUIRED_FIELDS) if (!mapping[field]) errors.push(`Map ${studentFieldLabel(field)} when guardian columns are present`);
  return errors;
}

export function ColumnMapping({ headers, mapping, onChange }: { headers: string[]; mapping: StudentCsvMapping; onChange: (mapping: StudentCsvMapping) => void }) {
  const optional = STUDENT_CSV_FIELDS.filter((field) => !STUDENT_CSV_REQUIRED_FIELDS.includes(field) && !field.startsWith("guardian") && field !== "relationshipType");
  const guardian = STUDENT_CSV_FIELDS.filter((field) => field.startsWith("guardian") || field === "relationshipType");
  function group(title: string, fields: readonly StudentCsvField[]) {
    return <section className="flex flex-col gap-4"><h3 className="font-semibold text-foreground">{title}</h3><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{fields.map((field) => <Field key={field}><FieldLabel htmlFor={`map-${field}`}>{studentFieldLabel(field)}{STUDENT_CSV_REQUIRED_FIELDS.includes(field) ? " *" : ""}</FieldLabel>
      <Select items={[{ label: "Do not map", value: "__skip__" }, ...headers.map((header) => ({ label: header, value: header }))]} value={mapping[field] ?? "__skip__"} onValueChange={(value) => { const next = { ...mapping }; if (value === "__skip__" || !value) delete next[field]; else next[field] = value; onChange(next); }}>
        <SelectTrigger id={`map-${field}`} className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent><SelectGroup><SelectItem value="__skip__">Do not map</SelectItem>{headers.map((header) => <SelectItem key={header} value={header}>{header}</SelectItem>)}</SelectGroup></SelectContent>
      </Select></Field>)}</div></section>;
  }
  return <div className="flex flex-col gap-6">{group("Required student and placement columns", STUDENT_CSV_REQUIRED_FIELDS)}{group("Optional student columns", optional)}{group("Guardian and relationship columns", guardian)}</div>;
}
