"use client";

import { useDeferredValue, useEffect, useId, useState, type FormEvent } from "react";
import { ChevronRight, Plus, Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import {
  addStaffSchool, createStaff, getStaff, linkStaffAccount, listEligibleAccounts, listStaff, listStaffSchools,
  unlinkStaffAccount, updateStaff, updateTeacher, type EligibleAccount, type StaffCreate,
  type StaffPage, type StaffRecord, type StaffSchool,
} from "@/lib/staff-api";
import { StaffForm } from "./staff-form";

const message = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed";

function Choice({ id, label, value, options, onChange, placeholder }: {
  id: string; label: string; value: string; options: { id: string; name: string }[];
  onChange: (value: string) => void; placeholder: string;
}) {
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Select items={[{ label: placeholder, value: null }, ...options.map((item) => ({ label: item.name, value: item.id }))]} value={value || null} onValueChange={(next) => onChange(next ?? "")}>
      <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent><SelectGroup>{options.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>
  </Field>;
}

function StaffDetails({ staff, schoolId, schools, onChanged }: { staff: StaffRecord; schoolId: string; schools: StaffSchool[]; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [eligible, setEligible] = useState<EligibleAccount[]>([]);
  const [membershipId, setMembershipId] = useState("");
  const [targetSchoolId, setTargetSchoolId] = useState("");
  const [targetKind, setTargetKind] = useState<"staff" | "teacher">("staff");
  const [targetDesignation, setTargetDesignation] = useState(staff.designation);
  const [error, setError] = useState("");
  const accountChoiceId = useId();
  const schoolChoiceId = useId();
  const kindChoiceId = useId();

  useEffect(() => {
    if (!staff.canEditShared || staff.membershipId) return;
    let cancelled = false;
    listEligibleAccounts(schoolId).then((items) => { if (!cancelled) setEligible(items); }).catch((cause) => { if (!cancelled) setError(message(cause)); });
    return () => { cancelled = true; };
  }, [schoolId, staff.canEditShared, staff.membershipId]);

  async function mutate(action: () => Promise<unknown>, success: string) {
    setBusy(true); setError("");
    try { await action(); toast.add({ type: "success", title: "Saved", description: success }); onChanged(); }
    catch (cause) { const detail = message(cause); setError(detail); toast.add({ type: "error", title: "Could not save staff details", description: detail, priority: "high" }); }
    finally { setBusy(false); }
  }
  const formValue = (data: FormData, name: string) => String(data.get(name) ?? "").trim();

  return <Card>
    <CardHeader><CardTitle>{staff.preferredName || staff.givenName} {staff.familyName}</CardTitle>
      <CardDescription>{staff.staffCode} · {staff.designation} at {schools.find((school) => school.id === schoolId)?.name ?? "this school"}</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-6">
      {error && <Alert variant="destructive"><AlertTitle>Could not complete the request</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="flex flex-wrap gap-2"><Badge variant={staff.status === "active" ? "default" : "secondary"}>{staff.status}</Badge><Badge variant="secondary">{staff.kind}</Badge><Badge variant="outline">{staff.membershipId ? "Linked account" : "No login account"}</Badge></div>
      <div className="grid gap-2 text-sm sm:grid-cols-2"><p><strong>Work email:</strong> {staff.workEmail || "—"}</p><p><strong>Phone:</strong> {staff.phone || "—"}</p><p><strong>Start date:</strong> {staff.startDate || "—"}</p><p><strong>Qualification:</strong> {staff.qualification || "—"}</p><p><strong>Specialization:</strong> {staff.specialization || "—"}</p></div>
      {staff.canManageAffiliation && <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); void mutate(() => updateStaff(schoolId, staff.id, { affiliation: { designation: formValue(data, "designation"), status: formValue(data, "status") as "active" | "inactive" } }), "School assignment updated"); }}>
        <FieldGroup><h3 className="font-semibold">School assignment</h3><Field><FieldLabel htmlFor="staff-edit-designation">Designation</FieldLabel><Input id="staff-edit-designation" name="designation" defaultValue={staff.designation} required maxLength={120} /></Field>
          <Field><FieldLabel htmlFor="staff-edit-status">Status</FieldLabel><Select name="status" defaultValue={staff.status} items={[{ label: "Active", value: "active" }, { label: "Inactive", value: "inactive" }]}><SelectTrigger id="staff-edit-status" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectGroup></SelectContent></Select></Field>
          <Button type="submit" variant="outline" disabled={busy}>Save school assignment</Button></FieldGroup></form>}
      {staff.canEditShared && <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void mutate(() => updateStaff(schoolId, staff.id, { profile: { givenName: formValue(data, "givenName"), familyName: formValue(data, "familyName"), preferredName: formValue(data, "preferredName") || null, workEmail: formValue(data, "workEmail") || null, phone: formValue(data, "phone") || null } }), "Shared profile updated"); }}><FieldGroup>
          <h3 className="font-semibold">Shared profile</h3><Field><FieldLabel htmlFor="staff-edit-given">Given name</FieldLabel><Input id="staff-edit-given" name="givenName" defaultValue={staff.givenName} required minLength={2} maxLength={120} /></Field>
          <Field><FieldLabel htmlFor="staff-edit-family">Family name</FieldLabel><Input id="staff-edit-family" name="familyName" defaultValue={staff.familyName} required minLength={2} maxLength={120} /></Field>
          <Field><FieldLabel htmlFor="staff-edit-preferred">Preferred name</FieldLabel><Input id="staff-edit-preferred" name="preferredName" defaultValue={staff.preferredName ?? ""} maxLength={120} /></Field>
          <Field><FieldLabel htmlFor="staff-edit-email">Work email</FieldLabel><Input id="staff-edit-email" name="workEmail" type="email" defaultValue={staff.workEmail ?? ""} maxLength={254} /></Field>
          <Field><FieldLabel htmlFor="staff-edit-phone">Phone</FieldLabel><Input id="staff-edit-phone" name="phone" type="tel" defaultValue={staff.phone ?? ""} maxLength={30} /></Field>
          <Button type="submit" variant="outline" disabled={busy}>Save shared profile</Button></FieldGroup></form>
        <div className="flex flex-col gap-6">
          <form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void mutate(() => updateTeacher(schoolId, staff.id, { qualification: formValue(data, "qualification") || null, specialization: formValue(data, "specialization") || null }), "Teacher details updated"); }}><FieldGroup>
            <h3 className="font-semibold">Teacher details</h3><Field><FieldLabel htmlFor="staff-edit-qualification">Qualification</FieldLabel><Input id="staff-edit-qualification" name="qualification" defaultValue={staff.qualification ?? ""} maxLength={240} /></Field><Field><FieldLabel htmlFor="staff-edit-specialization">Specialization</FieldLabel><Input id="staff-edit-specialization" name="specialization" defaultValue={staff.specialization ?? ""} maxLength={240} /></Field>
            <Button type="submit" variant="outline" disabled={busy}>Save teacher details</Button></FieldGroup></form>
          <FieldGroup><h3 className="font-semibold">Login account</h3>
            {staff.membershipId ? <><p className="text-sm text-muted-foreground">This profile is linked to an account. Unlinking is blocked when academic assignments use it.</p><Button type="button" variant="outline" disabled={busy} onClick={() => void mutate(() => unlinkStaffAccount(schoolId, staff.id), "Account unlinked")}>Unlink account</Button></> : <><Choice id={accountChoiceId} label="Eligible account" value={membershipId} onChange={setMembershipId} options={eligible.map((item) => ({ id: item.id, name: item.displayName ? `${item.displayName} (${item.email})` : item.email }))} placeholder="Select account" /><Button type="button" variant="outline" disabled={busy || !membershipId} onClick={() => void mutate(() => linkStaffAccount(schoolId, staff.id, membershipId), "Account linked")}>Link account</Button></>}
          </FieldGroup>
        </div>
      </div>}
      {staff.canManageAffiliation && schools.some((school) => school.id !== schoolId && school.canManageStaff) && <FieldGroup><h3 className="font-semibold">Add another school</h3>
        <Choice id={schoolChoiceId} label="School" value={targetSchoolId} onChange={setTargetSchoolId} options={schools.filter((school) => school.id !== schoolId && school.canManageStaff).map((school) => ({ id: school.id, name: school.name }))} placeholder="Select school" />
        <Field><FieldLabel htmlFor={kindChoiceId}>Role at school</FieldLabel><Select items={[{ label: "Staff", value: "staff" }, { label: "Teacher", value: "teacher" }]} value={targetKind} onValueChange={(next) => setTargetKind(next as "staff" | "teacher")}><SelectTrigger id={kindChoiceId} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="staff">Staff</SelectItem><SelectItem value="teacher">Teacher</SelectItem></SelectGroup></SelectContent></Select></Field>
        <Field><FieldLabel htmlFor="staff-new-designation">Designation at new school</FieldLabel><Input id="staff-new-designation" value={targetDesignation} onChange={(event) => setTargetDesignation(event.target.value)} maxLength={120} /></Field>
        <Button type="button" variant="outline" disabled={busy || !targetSchoolId || !targetDesignation.trim()} onClick={() => void mutate(() => addStaffSchool(schoolId, staff.id, { targetSchoolId, designation: targetDesignation.trim(), kind: targetKind }), "School added")}>Add school assignment</Button>
      </FieldGroup>}
      {!staff.canEditShared && <p className="text-sm text-muted-foreground">Shared profile and account details can be changed by a manager with access to every affiliated school.</p>}
    </CardContent>
  </Card>;
}

export function StaffClient() {
  const [schools, setSchools] = useState<StaffSchool[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [cursor, setCursor] = useState("");
  const [page, setPage] = useState<StaffPage | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState<StaffRecord | null>(null);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const schoolChoiceId = useId();
  const kindChoiceId = useId();
  const statusChoiceId = useId();

  useEffect(() => { listStaffSchools().then((items) => { setSchools(items); setSchoolId(items[0]?.id ?? ""); setLoading(false); }).catch((cause) => { setError(message(cause)); setLoading(false); }); }, []);
  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;
    listStaff(schoolId, { q: deferredQuery || undefined, kind: kind as "teacher" | "staff" || undefined, status: status as "active" | "inactive" || undefined, cursor: cursor || undefined })
      .then((result) => { if (!cancelled) { setPage(result); setError(""); } })
      .catch((cause) => { if (!cancelled) setError(message(cause)); });
    return () => { cancelled = true; };
  }, [schoolId, deferredQuery, kind, status, cursor, version]);
  useEffect(() => {
    if (!schoolId || !selectedId) return;
    let cancelled = false;
    getStaff(schoolId, selectedId).then((record) => { if (!cancelled) setSelected(record); }).catch((cause) => { if (!cancelled) setError(message(cause)); });
    return () => { cancelled = true; };
  }, [schoolId, selectedId, version]);
  const changed = () => setVersion((current) => current + 1);
  async function save(input: StaffCreate) {
    setBusy(true); setError("");
    try { const created = await createStaff(schoolId, input); setCreateOpen(false); setSelectedId(created.id); changed(); toast.add({ type: "success", title: "Staff profile created", description: `${created.givenName} ${created.familyName} is in the directory.` }); return true; }
    catch (cause) { const detail = message(cause); setError(detail); toast.add({ type: "error", title: "Could not create staff profile", description: detail, priority: "high" }); throw cause; }
    finally { setBusy(false); }
  }

  return <div className="flex flex-col gap-6">
    <div className="page-heading"><div><div className="breadcrumb"><span>School management</span><ChevronRight size={14} /><strong>Staff</strong></div><h1>Staff & teachers</h1><p>Manage staff profiles, school assignments and teacher account links.</p></div>
      {schools.find((school) => school.id === schoolId)?.canManageStaff && <Button onClick={() => setCreateOpen(true)}><Plus data-icon="inline-start" />Add staff</Button>}</div>
    {error && <Alert variant="destructive"><AlertTitle>Could not load staff details</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {loading ? <Skeleton className="h-56 w-full" /> : schools.length === 0 ? <Alert><AlertTitle>No accessible schools</AlertTitle><AlertDescription>Your workspace does not have staff directory access at a school.</AlertDescription></Alert> : <>
      <Card><CardHeader><CardTitle>Directory</CardTitle><CardDescription>Find people by name or staff code. Profiles can be affiliated with more than one school.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 md:grid-cols-4"><Choice id={schoolChoiceId} label="School" value={schoolId} onChange={(value) => { setSchoolId(value); setSelectedId(""); setSelected(null); setPage(null); setCursor(""); }} options={schools.map((school) => ({ id: school.id, name: school.name }))} placeholder="Select school" />
          <Field><FieldLabel htmlFor="staff-search">Search</FieldLabel><div className="relative"><Search aria-hidden="true" className="absolute top-2 left-2 size-4 text-muted-foreground" /><Input id="staff-search" className="pl-8" value={query} onChange={(event) => { setQuery(event.target.value); setCursor(""); }} placeholder="Name or code" /></div></Field>
          <Choice id={kindChoiceId} label="Role" value={kind} onChange={(value) => { setKind(value); setCursor(""); }} options={[{ id: "staff", name: "Staff" }, { id: "teacher", name: "Teacher" }]} placeholder="All roles" />
          <Choice id={statusChoiceId} label="Status" value={status} onChange={(value) => { setStatus(value); setCursor(""); }} options={[{ id: "active", name: "Active" }, { id: "inactive", name: "Inactive" }]} placeholder="All statuses" /></div>
        {page?.items.length ? <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Staff code</TableHead><TableHead>Designation</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead><span className="sr-only">View profile</span></TableHead></TableRow></TableHeader><TableBody>
          {page.items.map((item) => <TableRow key={item.id}><TableCell className="font-medium">{item.preferredName || item.givenName} {item.familyName}</TableCell><TableCell>{item.staffCode}</TableCell><TableCell>{item.designation}</TableCell><TableCell><Badge variant="secondary">{item.kind}</Badge></TableCell><TableCell><Badge variant={item.status === "active" ? "default" : "secondary"}>{item.status}</Badge></TableCell><TableCell><Button variant="outline" size="sm" onClick={() => setSelectedId(item.id)}>View</Button></TableCell></TableRow>)}
        </TableBody></Table> : <Alert><AlertTitle>No staff found</AlertTitle><AlertDescription>Try another search or filter, or add the first staff profile for this school.</AlertDescription></Alert>}
        <div className="flex justify-end gap-2">{cursor && <Button variant="outline" onClick={() => setCursor("")}>First page</Button>}{page?.nextCursor && <Button variant="outline" onClick={() => setCursor(page.nextCursor!)}>Next page</Button>}</div>
      </CardContent></Card>
      {selected && selected.id === selectedId && <StaffDetails key={`${schoolId}-${selectedId}-${version}`} staff={selected} schoolId={schoolId} schools={schools} onChanged={changed} />}
    </>}
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Create staff profile</DialogTitle><DialogDescription>Add a person to the selected school. A login account can be linked later.</DialogDescription></DialogHeader><StaffForm busy={busy} onSave={save} /></DialogContent></Dialog>
  </div>;
}
