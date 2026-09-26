"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiRequestError } from "@/lib/api-error";
import type { StaffCreate } from "@/lib/staff-api";
import { DateField } from "../academic-setup/date-field";

export function StaffForm({ busy, onSave }: { busy: boolean; onSave: (input: StaffCreate) => Promise<boolean> }) {
  const [kind, setKind] = useState<"staff" | "teacher">("staff");
  const [startDate, setStartDate] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    const input: StaffCreate = {
      staffCode: value("staffCode"), givenName: value("givenName"), familyName: value("familyName"),
      preferredName: value("preferredName") || null, workEmail: value("workEmail") || null,
      phone: value("phone") || null, designation: value("designation"), kind,
      startDate: startDate || null,
      ...(kind === "teacher" ? { qualification: value("qualification") || null, specialization: value("specialization") || null } : {}),
    };
    if (input.givenName.length < 2 || input.familyName.length < 2) {
      setFields({ ...(input.givenName.length < 2 ? { givenName: "Enter at least two characters" } : {}), ...(input.familyName.length < 2 ? { familyName: "Enter at least two characters" } : {}) });
      return;
    }
    setFields({});
    try { if (await onSave(input)) { formElement.reset(); setKind("staff"); setStartDate(""); } }
    catch (error) { if (error instanceof ApiRequestError) setFields(error.fields); }
  }

  const inputField = (name: string, label: string, required = false, type = "text") => <Field data-invalid={Boolean(fields[name]) || undefined}>
    <FieldLabel htmlFor={`staff-${name}`}>{label}</FieldLabel>
    <Input id={`staff-${name}`} name={name} type={type} required={required} aria-invalid={Boolean(fields[name]) || undefined} maxLength={name === "staffCode" ? 20 : name === "workEmail" ? 254 : name === "phone" ? 30 : name === "qualification" || name === "specialization" ? 240 : 120} />
    {fields[name] && <FieldError>{fields[name]}</FieldError>}
  </Field>;

  return <form onSubmit={(event) => void submit(event)}><FieldGroup>
    {inputField("staffCode", "Staff code", true)}
    <div className="grid gap-4 sm:grid-cols-2">{inputField("givenName", "Given name", true)}{inputField("familyName", "Family name", true)}</div>
    {inputField("preferredName", "Preferred name")}
    <div className="grid gap-4 sm:grid-cols-2">{inputField("workEmail", "Work email", false, "email")}{inputField("phone", "Phone", false, "tel")}</div>
    {inputField("designation", "Designation", true)}
    <Field><FieldLabel htmlFor="staff-kind">Role at this school</FieldLabel>
      <Select items={[{ label: "Staff", value: "staff" }, { label: "Teacher", value: "teacher" }]} value={kind} onValueChange={(next) => setKind(next as "staff" | "teacher")}>
        <SelectTrigger id="staff-kind" className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent><SelectGroup><SelectItem value="staff">Staff</SelectItem><SelectItem value="teacher">Teacher</SelectItem></SelectGroup></SelectContent>
      </Select>
    </Field>
    <DateField id="staff-start-date" label="Start date (optional)" value={startDate} onChange={setStartDate} required={false} />
    {kind === "teacher" && <div className="grid gap-4 sm:grid-cols-2">{inputField("qualification", "Qualification")}{inputField("specialization", "Specialization")}</div>}
    <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Create staff profile"}</Button>
  </FieldGroup></form>;
}
