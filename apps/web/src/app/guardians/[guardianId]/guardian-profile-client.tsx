"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { ApiRequestError } from "@/lib/api-error";
import { getGuardian, linkGuardianAccount, listEligiblePersonAccounts, listPeopleSchools, unlinkGuardianAccount, updateGuardian, type EligiblePersonAccount, type Guardian, type PeopleSchool } from "@/lib/students-api";

const message = (cause: unknown) => cause instanceof Error ? cause.message : "Guardian details could not be loaded";

export function GuardianProfileClient({ guardianId }: { guardianId: string }) {
  const [schools, setSchools] = useState<PeopleSchool[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [guardian, setGuardian] = useState<Guardian | null>(null);
  const [eligible, setEligible] = useState<EligiblePersonAccount[]>([]);
  const [membershipId, setMembershipId] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const school = schools.find((item) => item.id === schoolId);

  useEffect(() => {
    let cancelled = false;
    listPeopleSchools().then((items) => {
      if (cancelled) return;
      const readable = items.filter((item) => item.canReadGuardians);
      setSchools(readable);
      const requested = new URLSearchParams(window.location.search).get("school");
      setSchoolId(readable.find((item) => item.id === requested)?.id ?? readable[0]?.id ?? "");
      if (!readable.length) setLoading(false);
    }).catch((cause) => { if (!cancelled) { setError(message(cause)); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;
    getGuardian(schoolId, guardianId).then((value) => { if (!cancelled) { setGuardian(value); setError(""); } })
      .catch((cause) => { if (!cancelled) { setGuardian(null); setError(message(cause)); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [schoolId, guardianId, version]);
  useEffect(() => {
    if (!schoolId || !guardian?.canEditShared || guardian.membershipId) return;
    let cancelled = false;
    listEligiblePersonAccounts(schoolId, "guardian").then((value) => { if (!cancelled) setEligible(value); })
      .catch((cause) => { if (!cancelled) setError(message(cause)); });
    return () => { cancelled = true; };
  }, [schoolId, guardian?.canEditShared, guardian?.membershipId]);

  async function mutate(action: () => Promise<unknown>, success: string) {
    setBusy(true); setError("");
    try { await action(); setVersion((current) => current + 1); toast.add({ type: "success", title: "Saved", description: success }); }
    catch (cause) { const detail = message(cause); setError(detail); toast.add({ type: "error", title: "Could not save guardian details", description: detail, priority: "high" }); throw cause; }
    finally { setBusy(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) ?? "").trim();
    setFields({});
    try { await mutate(() => updateGuardian(schoolId, guardianId, {
      givenName: value("givenName"), familyName: value("familyName"), preferredName: value("preferredName") || null,
      email: value("email") || null, phone: value("phone") || null, occupation: value("occupation") || null,
      addressLine1: value("addressLine1") || null, addressLine2: value("addressLine2") || null,
      city: value("city") || null, state: value("state") || null, postalCode: value("postalCode") || null,
      countryCode: value("countryCode") || null,
    }), "Guardian profile updated"); }
    catch (cause) { if (cause instanceof ApiRequestError) setFields(cause.fields); }
  }

  return <div className="flex flex-col gap-6"><div className="page-heading"><div><div className="breadcrumb"><Link href={`/guardians?school=${schoolId}`}>Guardians</Link><ChevronRight size={14} /><strong>Profile</strong></div><h1>{guardian ? `${guardian.preferredName || guardian.givenName || "Unknown guardian"} ${guardian.familyName}` : "Guardian profile"}</h1><p>Contact details, linked students, responsibilities, and account access.</p></div></div>
    {error && <Alert variant="destructive"><AlertTitle>Guardian details need attention</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {loading ? <Skeleton className="h-96 w-full" /> : !school ? <Alert><AlertTitle>No accessible school</AlertTitle><AlertDescription>Your workspace cannot view this guardian.</AlertDescription></Alert> : guardian ? <>
      <Card><CardContent className="flex flex-wrap items-center gap-4 py-5"><Avatar size="lg"><AvatarFallback>{(guardian.preferredName || guardian.givenName || "G").slice(0, 2).toUpperCase()}</AvatarFallback></Avatar><div className="flex-1"><h2 className="text-lg font-semibold text-foreground">{guardian.preferredName || guardian.givenName || "Unknown guardian"} {guardian.familyName}</h2><p className="text-sm text-muted-foreground">{guardian.guardianCode} · {school.name}</p></div><Badge variant={guardian.status === "active" ? "default" : "secondary"}>{guardian.status}</Badge></CardContent></Card>
      <div className="grid gap-6 xl:grid-cols-2"><Card><CardHeader><CardTitle>Contact details</CardTitle><CardDescription>Shared across schools in this workspace.</CardDescription></CardHeader><CardContent className="flex flex-col gap-5"><div className="grid gap-2 text-sm sm:grid-cols-2"><p><strong>Email:</strong> {guardian.email ?? "—"}</p><p><strong>Phone:</strong> {guardian.phone ?? "—"}</p><p><strong>Occupation:</strong> {guardian.occupation ?? "—"}</p><p><strong>Address:</strong> {[guardian.addressLine1, guardian.city, guardian.state, guardian.postalCode].filter(Boolean).join(", ") || "—"}</p></div>
        {guardian.canEditShared && school.canManageGuardians ? <form onSubmit={(event) => void save(event)}><FieldGroup><div className="grid gap-4 sm:grid-cols-2">{(["givenName", "familyName"] as const).map((key) => <Field key={key} data-invalid={Boolean(fields[key]) || undefined}><FieldLabel htmlFor={`guardian-edit-${key}`}>{key === "givenName" ? "Given name" : "Family name"}</FieldLabel><Input id={`guardian-edit-${key}`} name={key} defaultValue={guardian[key]} required minLength={2} maxLength={120} aria-invalid={Boolean(fields[key]) || undefined} />{fields[key] && <FieldError>{fields[key]}</FieldError>}</Field>)}</div>
          {(["preferredName", "email", "phone", "occupation", "addressLine1", "addressLine2", "city", "state", "postalCode", "countryCode"] as const).map((key) => <Field key={key}><FieldLabel htmlFor={`guardian-edit-${key}`}>{key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase())}</FieldLabel><Input id={`guardian-edit-${key}`} name={key} defaultValue={guardian[key] ?? ""} type={key === "email" ? "email" : key === "phone" ? "tel" : "text"} maxLength={key === "email" ? 254 : key === "addressLine1" || key === "addressLine2" ? 240 : key === "countryCode" ? 2 : 120} /></Field>)}
          <Button type="submit" disabled={busy}>Save contact details</Button></FieldGroup></form> : <p className="text-sm text-muted-foreground">Shared details can be edited by a manager with access to every school where this guardian is actively linked.</p>}
      </CardContent></Card>
      <div className="flex flex-col gap-6"><Card><CardHeader><CardTitle>Linked students</CardTitle><CardDescription>Relationships at this school and throughout the workspace.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">{guardian.students?.length ? guardian.students.map((item) => <div key={item.relationship.id} className="rounded-lg border p-3"><Link href={`/students/${item.student.id}?school=${schoolId}`} className="font-medium text-foreground underline-offset-4 hover:underline">{item.student.preferredName || item.student.givenName} {item.student.familyName}</Link><p className="text-sm text-muted-foreground">{item.relationship.relationshipType.replaceAll("_", " ")} · {item.student.studentCode}</p><div className="mt-2 flex flex-wrap gap-1">{(["primaryContact", "emergencyContact", "authorizedPickup", "financialResponsibility", "portalAccess"] as const).filter((key) => item.relationship[key]).map((key) => <Badge key={key} variant="outline">{key.replace(/([A-Z])/g, " $1")}</Badge>)}</div></div>) : <Empty><EmptyHeader><EmptyTitle>No students linked</EmptyTitle><EmptyDescription>Connect this guardian from a student profile or a new admission.</EmptyDescription></EmptyHeader></Empty>}</CardContent></Card>
        <Card><CardHeader><CardTitle>Account access</CardTitle><CardDescription>Optionally link one active tenant account.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><Badge variant={guardian.membershipId ? "default" : "secondary"} className="w-fit">{guardian.membershipId ? "Linked account" : "No login account"}</Badge>{guardian.canEditShared && school.canManageGuardians && (guardian.membershipId ? <Button variant="outline" className="w-fit" disabled={busy} onClick={() => { void mutate(() => unlinkGuardianAccount(schoolId, guardianId), "Guardian account unlinked").catch(() => {}); }}>Unlink account</Button> : <div className="flex flex-wrap items-end gap-3"><Field className="min-w-56 flex-1"><FieldLabel htmlFor="guardian-account">Eligible account</FieldLabel><Select items={eligible.map((item) => ({ label: item.displayName ? `${item.displayName} (${item.email})` : item.email, value: item.id }))} value={membershipId || null} onValueChange={(value) => setMembershipId(value ?? "")}><SelectTrigger id="guardian-account" className="w-full"><SelectValue placeholder="Choose account" /></SelectTrigger><SelectContent><SelectGroup>{eligible.map((item) => <SelectItem key={item.id} value={item.id}>{item.displayName ? `${item.displayName} (${item.email})` : item.email}</SelectItem>)}</SelectGroup></SelectContent></Select></Field><Button variant="outline" disabled={busy || !membershipId} onClick={() => { void mutate(() => linkGuardianAccount(schoolId, guardianId, membershipId), "Guardian account linked").catch(() => {}); }}>Link account</Button></div>)}</CardContent></Card>
      </div></div>
    </> : !error && <Empty><EmptyHeader><EmptyTitle>Guardian not found</EmptyTitle><EmptyDescription>Check the selected school or return to the directory.</EmptyDescription></EmptyHeader></Empty>}
  </div>;
}
