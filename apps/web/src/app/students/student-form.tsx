"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiRequestError } from "@/lib/api-error";
import type { AcademicSetup } from "@/lib/academics-api";
import type { AdmissionInput } from "@/lib/enrollment-api";
import { DateField } from "../academic-setup/date-field";

type GuardianDraft = { key: number; relationshipType: "mother" | "father" | "legal_guardian" | "grandparent" | "sibling" | "other"; primaryContact: boolean; emergencyContact: boolean; authorizedPickup: boolean; financialResponsibility: boolean; portalAccess: boolean };
const newGuardian = (key: number): GuardianDraft => ({ key, relationshipType: "mother", primaryContact: false, emergencyContact: false, authorizedPickup: false, financialResponsibility: false, portalAccess: false });

export function StudentForm({ setup, busy, onSave }: { setup: AcademicSetup; busy: boolean; onSave: (input: AdmissionInput) => Promise<boolean> }) {
  const [birthDate, setBirthDate] = useState("");
  const [admissionDate, setAdmissionDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [guardians, setGuardians] = useState<GuardianDraft[]>([]);
  const [nextGuardianKey, setNextGuardianKey] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const classes = setup.classes.filter((item) => item.sessionId === sessionId);
  const sections = setup.sections.filter((item) => item.classId === classId);

  function textField(name: string, label: string, required = false, type = "text", maxLength = 120) {
    const path = `student.${name}`;
    return <Field data-invalid={Boolean(errors[path]) || undefined}><FieldLabel htmlFor={`admit-${name}`}>{label}</FieldLabel>
      <Input id={`admit-${name}`} name={name} type={type} required={required} minLength={required && ["givenName", "familyName"].includes(name) ? 2 : undefined} maxLength={maxLength} aria-invalid={Boolean(errors[path]) || undefined} />
      {errors[path] && <FieldError>{errors[path]}</FieldError>}</Field>;
  }

  function updateGuardian(key: number, patch: Partial<GuardianDraft>) {
    setGuardians((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (name: string) => String(data.get(name) ?? "").trim();
    const nextErrors: Record<string, string> = {};
    if (!birthDate) nextErrors["student.dateOfBirth"] = "Choose a date of birth";
    if (!admissionDate) nextErrors["schoolEnrollment.admissionDate"] = "Choose an admission date";
    if (!startDate) nextErrors["academicEnrollment.startDate"] = "Choose a placement start date";
    if (!sessionId) nextErrors["academicEnrollment.sessionId"] = "Choose an academic session";
    if (!classId) nextErrors["academicEnrollment.classId"] = "Choose a class";
    if (!sectionId) nextErrors["academicEnrollment.sectionId"] = "Choose a section";
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return; }
    const input: AdmissionInput = {
      student: { studentCode: value("studentCode"), givenName: value("givenName"), familyName: value("familyName"),
        middleName: value("middleName") || null, preferredName: value("preferredName") || null,
        dateOfBirth: birthDate, gender: value("gender") || null, email: value("email") || null, phone: value("phone") || null },
      schoolEnrollment: { admissionNumber: value("admissionNumber"), admissionDate },
      academicEnrollment: { sessionId, classId, sectionId, rollNumber: value("rollNumber") || null, startDate },
      guardians: guardians.map((item) => ({
        guardian: { guardianCode: value(`guardianCode-${item.key}`), givenName: value(`guardianGivenName-${item.key}`), familyName: value(`guardianFamilyName-${item.key}`), email: value(`guardianEmail-${item.key}`) || null, phone: value(`guardianPhone-${item.key}`) || null },
        relationship: { relationshipType: item.relationshipType, primaryContact: item.primaryContact, emergencyContact: item.emergencyContact, authorizedPickup: item.authorizedPickup, financialResponsibility: item.financialResponsibility, portalAccess: item.portalAccess },
      })),
    };
    setErrors({});
    try { await onSave(input); }
    catch (cause) { if (cause instanceof ApiRequestError) setErrors(cause.fields); }
  }

  return <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
    <Card><CardHeader><CardTitle>Student identity</CardTitle><CardDescription>One student code identifies this person across schools in the workspace.</CardDescription></CardHeader><CardContent><FieldGroup>
      {textField("studentCode", "Student code", true, "text", 20)}
      <div className="grid gap-4 sm:grid-cols-2">{textField("givenName", "Given name", true)}{textField("familyName", "Family name", true)}</div>
      <div className="grid gap-4 sm:grid-cols-2">{textField("middleName", "Middle name")}{textField("preferredName", "Preferred name")}</div>
      <DateField id="admit-date-of-birth" label="Date of birth" value={birthDate} onChange={setBirthDate} error={errors["student.dateOfBirth"]} yearDropdown />
      <div className="grid gap-4 sm:grid-cols-3">{textField("gender", "Gender")}{textField("email", "Email", false, "email", 254)}{textField("phone", "Phone", false, "tel", 30)}</div>
    </FieldGroup></CardContent></Card>
    <Card><CardHeader><CardTitle>School admission</CardTitle><CardDescription>Choose the school admission and its first academic placement.</CardDescription></CardHeader><CardContent><FieldGroup>
      <Field data-invalid={Boolean(errors["schoolEnrollment.admissionNumber"]) || undefined}><FieldLabel htmlFor="admit-number">Admission number</FieldLabel><Input id="admit-number" name="admissionNumber" required maxLength={40} aria-invalid={Boolean(errors["schoolEnrollment.admissionNumber"]) || undefined} />{errors["schoolEnrollment.admissionNumber"] && <FieldError>{errors["schoolEnrollment.admissionNumber"]}</FieldError>}</Field>
      <div className="grid gap-4 sm:grid-cols-2"><DateField id="admit-admission-date" label="Admission date" value={admissionDate} onChange={setAdmissionDate} error={errors["schoolEnrollment.admissionDate"]} /><DateField id="admit-start-date" label="Placement start date" value={startDate} onChange={setStartDate} error={errors["academicEnrollment.startDate"]} /></div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field data-invalid={Boolean(errors["academicEnrollment.sessionId"]) || undefined}><FieldLabel htmlFor="admit-session">Session</FieldLabel><Select items={setup.sessions.map((item) => ({ label: item.name, value: item.id }))} value={sessionId || null} onValueChange={(next) => { setSessionId(next ?? ""); setClassId(""); setSectionId(""); }}><SelectTrigger id="admit-session" className="w-full" aria-invalid={Boolean(errors["academicEnrollment.sessionId"]) || undefined}><SelectValue placeholder="Choose session" /></SelectTrigger><SelectContent><SelectGroup>{setup.sessions.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select>{errors["academicEnrollment.sessionId"] && <FieldError>{errors["academicEnrollment.sessionId"]}</FieldError>}</Field>
        <Field data-invalid={Boolean(errors["academicEnrollment.classId"]) || undefined}><FieldLabel htmlFor="admit-class">Class</FieldLabel><Select items={classes.map((item) => ({ label: item.name, value: item.id }))} value={classId || null} onValueChange={(next) => { setClassId(next ?? ""); setSectionId(""); }}><SelectTrigger id="admit-class" className="w-full" aria-invalid={Boolean(errors["academicEnrollment.classId"]) || undefined}><SelectValue placeholder="Choose class" /></SelectTrigger><SelectContent><SelectGroup>{classes.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select>{errors["academicEnrollment.classId"] && <FieldError>{errors["academicEnrollment.classId"]}</FieldError>}</Field>
        <Field data-invalid={Boolean(errors["academicEnrollment.sectionId"]) || undefined}><FieldLabel htmlFor="admit-section">Section</FieldLabel><Select items={sections.map((item) => ({ label: item.name, value: item.id }))} value={sectionId || null} onValueChange={(next) => setSectionId(next ?? "")}><SelectTrigger id="admit-section" className="w-full" aria-invalid={Boolean(errors["academicEnrollment.sectionId"]) || undefined}><SelectValue placeholder="Choose section" /></SelectTrigger><SelectContent><SelectGroup>{sections.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select>{errors["academicEnrollment.sectionId"] && <FieldError>{errors["academicEnrollment.sectionId"]}</FieldError>}</Field>
      </div>
      <Field><FieldLabel htmlFor="admit-roll-number">Roll number (optional)</FieldLabel><Input id="admit-roll-number" name="rollNumber" maxLength={40} /></Field>
    </FieldGroup></CardContent></Card>
    <Card><CardHeader><CardTitle>Guardians</CardTitle><CardDescription>Add family contacts now, or connect them from the student profile later.</CardDescription></CardHeader><CardContent className="flex flex-col gap-5">
      {guardians.map((item, index) => <fieldset key={item.key} className="rounded-lg border p-4"><legend className="px-1 font-medium">Guardian {index + 1}</legend><FieldGroup>
        <div className="grid gap-4 sm:grid-cols-3">{[["guardianCode", "Guardian code"], ["guardianGivenName", "Given name"], ["guardianFamilyName", "Family name"]].map(([name, label]) => <Field key={name}><FieldLabel htmlFor={`${name}-${item.key}`}>{label}</FieldLabel><Input id={`${name}-${item.key}`} name={`${name}-${item.key}`} required minLength={name === "guardianCode" ? undefined : 2} maxLength={name === "guardianCode" ? 20 : 120} /></Field>)}</div>
        <div className="grid gap-4 sm:grid-cols-2">{[["guardianEmail", "Email"], ["guardianPhone", "Phone"]].map(([name, label]) => <Field key={name}><FieldLabel htmlFor={`${name}-${item.key}`}>{label}</FieldLabel><Input id={`${name}-${item.key}`} name={`${name}-${item.key}`} type={name === "guardianEmail" ? "email" : "tel"} maxLength={name === "guardianEmail" ? 254 : 30} /></Field>)}</div>
        <Field><FieldLabel htmlFor={`guardian-relationship-${item.key}`}>Relationship</FieldLabel><Select items={["mother", "father", "legal_guardian", "grandparent", "sibling", "other"].map((value) => ({ label: value.replaceAll("_", " "), value }))} value={item.relationshipType} onValueChange={(value) => updateGuardian(item.key, { relationshipType: value as GuardianDraft["relationshipType"] })}><SelectTrigger id={`guardian-relationship-${item.key}`} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{["mother", "father", "legal_guardian", "grandparent", "sibling", "other"].map((value) => <SelectItem key={value} value={value}>{value.replaceAll("_", " ")}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
        <div className="grid gap-3 sm:grid-cols-2">{(["primaryContact", "emergencyContact", "authorizedPickup", "financialResponsibility", "portalAccess"] as const).map((flag) => <label key={flag} className="flex items-center gap-2 text-sm font-medium text-foreground"><Checkbox checked={item[flag]} onCheckedChange={(checked) => updateGuardian(item.key, { [flag]: checked === true })} />{flag.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase())}</label>)}</div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setGuardians((current) => current.filter((row) => row.key !== item.key))}><Trash2 data-icon="inline-start" />Remove guardian</Button>
      </FieldGroup></fieldset>)}
      <Button type="button" variant="outline" disabled={guardians.length >= 10} onClick={() => { setGuardians((current) => [...current, newGuardian(nextGuardianKey)]); setNextGuardianKey((current) => current + 1); }}><Plus data-icon="inline-start" />Add guardian</Button>
    </CardContent></Card>
    <div className="flex justify-end"><Button type="submit" disabled={busy}>{busy && <LoaderCircle data-icon="inline-start" className="animate-spin" />}{busy ? "Saving admission…" : "Admit student"}</Button></div>
  </form>;
}
