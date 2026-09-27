'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ChevronRight, ClipboardCheck, RotateCcw, Send, UserCheck, UserX } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { getAcademicSetup, type AcademicSetup } from '@/lib/academics-api';
import { admitAdmissionCase, decideAdmissionCase, getAdmissionCase, listAdmissionCaseEvents, listAdmissionSchools, reviewAdmissionCase, transitionAdmissionCase, updateAdmissionCase, withdrawAdmissionCase, type AdmissionCase, type AdmissionEvent, type AdmissionGuardian, type AdmissionSchool, type AdmissionStatus } from '@/lib/admissions-api';
import { DateField } from '../../academic-setup/date-field';

const failureMessage = (cause: unknown) => cause instanceof Error ? cause.message : 'The admission case could not be loaded.';
const statusVariant = (status: AdmissionStatus) => status === 'accepted' || status === 'admitted' ? 'default' : status === 'rejected' || status === 'withdrawn' ? 'destructive' : status === 'under_review' ? 'secondary' : 'outline';
const guardianRelationships = ['mother', 'father', 'legal_guardian', 'grandparent', 'sibling', 'other'] as const;
const dateLabel = (value: string | null) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(`${value.slice(0, 10)}T12:00:00`)) : '—';
const eventLabel = (value: string) => value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());

function ApplicationEditor({ record, setup, busy, onSave }: { record: AdmissionCase; setup: AcademicSetup | null; busy: boolean; onSave: (input: Parameters<typeof updateAdmissionCase>[2]) => Promise<void> }) {
  const [dateOfBirth, setDateOfBirth] = useState(record.studentDateOfBirth ?? '');
  const [sessionId, setSessionId] = useState(record.requestedSessionId ?? '');
  const [classId, setClassId] = useState(record.requestedClassId ?? '');
  const [sectionId, setSectionId] = useState(record.requestedSectionId ?? '');
  const [guardianTypes, setGuardianTypes] = useState(record.guardians.map((guardian) => guardian.relationshipType));
  const classes = setup?.classes.filter((item) => item.sessionId === sessionId) ?? [];
  const sections = setup?.sections.filter((item) => item.classId === classId) ?? [];
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); const value = (name: string) => String(data.get(name) ?? '').trim() || null;
    const selectValue = (name: string) => { const selected = value(name); return selected === '__none__' ? null : selected; };
    void onSave({
      studentGivenName: value('studentGivenName'), studentMiddleName: value('studentMiddleName'), studentFamilyName: value('studentFamilyName'),
      studentPreferredName: value('studentPreferredName'), studentDateOfBirth: dateOfBirth || null, studentGender: value('studentGender'),
      studentEmail: value('studentEmail'), studentPhone: value('studentPhone'), existingStudentId: value('existingStudentId'), requestedSessionId: selectValue('requestedSessionId'),
      requestedClassId: selectValue('requestedClassId'), requestedSectionId: sectionId || null, reviewNote: value('reviewNote'),
      guardians: record.guardians.map((guardian, index) => ({
        guardianProfileId: value(`guardianProfileId-${index}`), guardianCode: guardian.guardianCode,
        givenName: value(`guardianGivenName-${index}`) ?? '', middleName: value(`guardianMiddleName-${index}`), familyName: value(`guardianFamilyName-${index}`) ?? '',
        preferredName: value(`guardianPreferredName-${index}`), email: value(`guardianEmail-${index}`), phone: value(`guardianPhone-${index}`), occupation: value(`guardianOccupation-${index}`),
        addressLine1: value(`guardianAddress1-${index}`), addressLine2: value(`guardianAddress2-${index}`), city: value(`guardianCity-${index}`), state: value(`guardianState-${index}`),
        postalCode: value(`guardianPostal-${index}`), countryCode: value(`guardianCountry-${index}`), relationshipType: guardianTypes[index] ?? guardian.relationshipType,
        primaryContact: guardian.primaryContact, emergencyContact: guardian.emergencyContact, authorizedPickup: guardian.authorizedPickup,
        financialResponsibility: guardian.financialResponsibility, portalAccess: guardian.portalAccess,
      })),
    });
  }
  return <form onSubmit={submit} className="flex flex-col gap-5"><div className="grid gap-4 md:grid-cols-2">
    <Field><FieldLabel htmlFor="case-given">Given name</FieldLabel><Input id="case-given" name="studentGivenName" defaultValue={record.studentGivenName ?? ''} maxLength={120} /></Field>
    <Field><FieldLabel htmlFor="case-family">Family name</FieldLabel><Input id="case-family" name="studentFamilyName" defaultValue={record.studentFamilyName ?? ''} maxLength={120} /></Field>
    <Field><FieldLabel htmlFor="case-middle">Middle name</FieldLabel><Input id="case-middle" name="studentMiddleName" defaultValue={record.studentMiddleName ?? ''} maxLength={120} /></Field>
    <Field><FieldLabel htmlFor="case-preferred">Preferred name</FieldLabel><Input id="case-preferred" name="studentPreferredName" defaultValue={record.studentPreferredName ?? ''} maxLength={120} /></Field>
    <Field className="md:col-span-2"><FieldLabel htmlFor="case-existing-student">Existing student profile ID (optional)</FieldLabel><Input id="case-existing-student" name="existingStudentId" defaultValue={record.existingStudentId ?? ''} placeholder="Paste the ID from the student profile URL" /></Field>
    <DateField id="case-dob" label="Date of birth" value={dateOfBirth} onChange={setDateOfBirth} required={false} />
    <Field><FieldLabel htmlFor="case-gender">Gender</FieldLabel><Input id="case-gender" name="studentGender" defaultValue={record.studentGender ?? ''} maxLength={50} /></Field>
    <Field><FieldLabel htmlFor="case-email">Student email</FieldLabel><Input id="case-email" name="studentEmail" type="email" defaultValue={record.studentEmail ?? ''} maxLength={254} /></Field>
    <Field><FieldLabel htmlFor="case-phone">Student phone</FieldLabel><Input id="case-phone" name="studentPhone" type="tel" defaultValue={record.studentPhone ?? ''} maxLength={30} /></Field>
    <Field><FieldLabel htmlFor="case-session">Requested session</FieldLabel><Select name="requestedSessionId" value={sessionId || '__none__'} onValueChange={(next) => { setSessionId(next === '__none__' ? '' : next ?? ''); setClassId(''); setSectionId(''); }} items={[{ label: 'Not selected', value: '__none__' }, ...(setup?.sessions ?? []).map((item) => ({ label: item.name, value: item.id }))]}><SelectTrigger id="case-session" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="__none__">Not selected</SelectItem>{(setup?.sessions ?? []).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
    <Field><FieldLabel htmlFor="case-class">Requested class</FieldLabel><Select name="requestedClassId" value={classId || '__none__'} onValueChange={(next) => { setClassId(next === '__none__' ? '' : next ?? ''); setSectionId(''); }} items={[{ label: 'Not selected', value: '__none__' }, ...classes.map((item) => ({ label: item.name, value: item.id }))]}><SelectTrigger id="case-class" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="__none__">Not selected</SelectItem>{classes.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
    <Field><FieldLabel htmlFor="case-section">Requested section</FieldLabel><Select value={sectionId || '__none__'} onValueChange={(next) => setSectionId(next === '__none__' ? '' : next ?? '')} items={[{ label: 'Not selected', value: '__none__' }, ...sections.map((item) => ({ label: item.name, value: item.id }))]}><SelectTrigger id="case-section" className="w-full"><SelectValue placeholder="Not selected" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="__none__">Not selected</SelectItem>{sections.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
  </div>
  {record.guardians.length > 0 && <div className="flex flex-col gap-4"><h3 className="font-semibold">Guardian application details</h3>{record.guardians.map((guardian, index) => <fieldset key={guardian.id} className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"><legend className="px-1 text-sm font-medium">Guardian {index + 1}</legend>
    <Field><FieldLabel htmlFor={`edit-guardian-given-${index}`}>Given name</FieldLabel><Input id={`edit-guardian-given-${index}`} name={`guardianGivenName-${index}`} defaultValue={guardian.givenName} maxLength={120} /></Field>
    <Field><FieldLabel htmlFor={`edit-guardian-family-${index}`}>Family name</FieldLabel><Input id={`edit-guardian-family-${index}`} name={`guardianFamilyName-${index}`} defaultValue={guardian.familyName} maxLength={120} /></Field>
    <Field className="sm:col-span-2"><FieldLabel htmlFor={`edit-guardian-profile-${index}`}>Existing guardian profile ID (optional)</FieldLabel><Input id={`edit-guardian-profile-${index}`} name={`guardianProfileId-${index}`} defaultValue={guardian.guardianProfileId ?? ''} placeholder="Paste the ID from the guardian profile URL" /></Field>
    <Field><FieldLabel htmlFor={`edit-guardian-middle-${index}`}>Middle name</FieldLabel><Input id={`edit-guardian-middle-${index}`} name={`guardianMiddleName-${index}`} defaultValue={guardian.middleName ?? ''} maxLength={120} /></Field>
    <Field><FieldLabel htmlFor={`edit-guardian-preferred-${index}`}>Preferred name</FieldLabel><Input id={`edit-guardian-preferred-${index}`} name={`guardianPreferredName-${index}`} defaultValue={guardian.preferredName ?? ''} maxLength={120} /></Field>
    <Field><FieldLabel htmlFor={`edit-guardian-email-${index}`}>Email</FieldLabel><Input id={`edit-guardian-email-${index}`} name={`guardianEmail-${index}`} type="email" defaultValue={guardian.email ?? ''} maxLength={254} /></Field>
    <Field><FieldLabel htmlFor={`edit-guardian-phone-${index}`}>Phone</FieldLabel><Input id={`edit-guardian-phone-${index}`} name={`guardianPhone-${index}`} defaultValue={guardian.phone ?? ''} maxLength={30} /></Field>
    <Field><FieldLabel htmlFor={`edit-guardian-occupation-${index}`}>Occupation</FieldLabel><Input id={`edit-guardian-occupation-${index}`} name={`guardianOccupation-${index}`} defaultValue={guardian.occupation ?? ''} maxLength={120} /></Field>
    <Field><FieldLabel htmlFor={`edit-guardian-relationship-${index}`}>Relationship</FieldLabel><Select value={guardianTypes[index]} onValueChange={(next) => setGuardianTypes((current) => current.map((value, position) => position === index ? next as AdmissionGuardian['relationshipType'] : value))} items={guardianRelationships.map((value) => ({ label: value.replaceAll('_', ' '), value }))}><SelectTrigger id={`edit-guardian-relationship-${index}`} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{guardianRelationships.map((value) => <SelectItem key={value} value={value}>{value.replaceAll('_', ' ')}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
    <Field><FieldLabel htmlFor={`edit-guardian-address-${index}`}>Address</FieldLabel><Input id={`edit-guardian-address-${index}`} name={`guardianAddress1-${index}`} defaultValue={guardian.addressLine1 ?? ''} maxLength={240} /></Field>
    <Field><FieldLabel htmlFor={`edit-guardian-address2-${index}`}>Address line 2</FieldLabel><Input id={`edit-guardian-address2-${index}`} name={`guardianAddress2-${index}`} defaultValue={guardian.addressLine2 ?? ''} maxLength={240} /></Field>
    <Field><FieldLabel htmlFor={`edit-guardian-city-${index}`}>City</FieldLabel><Input id={`edit-guardian-city-${index}`} name={`guardianCity-${index}`} defaultValue={guardian.city ?? ''} maxLength={120} /></Field>
    <Field><FieldLabel htmlFor={`edit-guardian-state-${index}`}>State</FieldLabel><Input id={`edit-guardian-state-${index}`} name={`guardianState-${index}`} defaultValue={guardian.state ?? ''} maxLength={120} /></Field>
    <Field><FieldLabel htmlFor={`edit-guardian-postal-${index}`}>Postal code</FieldLabel><Input id={`edit-guardian-postal-${index}`} name={`guardianPostal-${index}`} defaultValue={guardian.postalCode ?? ''} maxLength={30} /></Field>
    <Field><FieldLabel htmlFor={`edit-guardian-country-${index}`}>Country code</FieldLabel><Input id={`edit-guardian-country-${index}`} name={`guardianCountry-${index}`} defaultValue={guardian.countryCode ?? ''} maxLength={2} /></Field>
  </fieldset>)}</div>}
  <Field><FieldLabel htmlFor="case-review-note">Staff review note</FieldLabel><Textarea id="case-review-note" name="reviewNote" defaultValue={record.reviewNote ?? ''} maxLength={500} /></Field>
  <Button type="submit" variant="outline" disabled={busy}>Save application details</Button>
  </form>;
}

export function AdmissionCaseClient({ caseId }: { caseId: string }) {
  const [schools, setSchools] = useState<AdmissionSchool[]>([]); const [schoolId, setSchoolId] = useState('');
  const [record, setRecord] = useState<AdmissionCase | null>(null); const [events, setEvents] = useState<AdmissionEvent[]>([]); const [setup, setSetup] = useState<AcademicSetup | null>(null);
  const [schoolsLoaded, setSchoolsLoaded] = useState(false); const [loadedKey, setLoadedKey] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [version, setVersion] = useState(0);
  const [note, setNote] = useState(''); const [returnOpen, setReturnOpen] = useState(false); const [decisionOpen, setDecisionOpen] = useState(false); const [decision, setDecision] = useState<'accept' | 'reject'>('accept'); const [withdrawOpen, setWithdrawOpen] = useState(false); const [convertOpen, setConvertOpen] = useState(false);
  const [admissionNumber, setAdmissionNumber] = useState(''); const [admissionDate, setAdmissionDate] = useState(''); const [startDate, setStartDate] = useState('');
  const [studentCode, setStudentCode] = useState(''); const [guardianCodes, setGuardianCodes] = useState(''); const [placementSessionId, setPlacementSessionId] = useState(''); const [placementClassId, setPlacementClassId] = useState(''); const [placementSectionId, setPlacementSectionId] = useState(''); const [rollNumber, setRollNumber] = useState('');
  const noteId = useId(); const admissionNumberId = useId(); const studentCodeId = useId(); const sessionId = useId(); const classId = useId(); const sectionId = useId(); const rollId = useId();
  const school = schools.find((item) => item.id === schoolId); const classes = setup?.classes.filter((item) => item.sessionId === placementSessionId) ?? []; const sections = setup?.sections.filter((item) => item.classId === placementClassId) ?? [];

  useEffect(() => {
    let cancelled = false;
    listAdmissionSchools().then((items) => {
      if (cancelled) return;
      setSchools(items);
      const requested = new URLSearchParams(window.location.search).get('school');
      const selected = items.find((item) => item.id === requested && (item.canReadAdmissions || item.canManageAdmissions || item.canConvertAdmissions)) ?? items.find((item) => item.canReadAdmissions || item.canManageAdmissions || item.canConvertAdmissions);
      setSchoolId(selected?.id ?? '');
      setSchoolsLoaded(true);
    }).catch((cause) => { if (!cancelled) { setError(failureMessage(cause)); setSchoolsLoaded(true); } });
    return () => { cancelled = true; };
  }, []);

  const requestKey = `${schoolId}|${caseId}|${version}`;
  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;
    Promise.all([getAdmissionCase(schoolId, caseId), listAdmissionCaseEvents(schoolId, caseId), getAcademicSetup(schoolId).catch(() => null)]).then(([fresh, history, academic]) => {
      if (cancelled) return;
      setRecord(fresh); setEvents(history); setSetup(academic); setError('');
      setAdmissionNumber(fresh.caseReference); setAdmissionDate(''); setStartDate('');
      setPlacementSessionId(fresh.requestedSessionId ?? academic?.sessions.find((item) => item.status === 'active')?.id ?? '');
      setPlacementClassId(fresh.requestedClassId ?? ''); setPlacementSectionId(fresh.requestedSectionId ?? ''); setLoadedKey(requestKey);
    }).catch((cause) => { if (!cancelled) { setRecord(null); setError(failureMessage(cause)); setLoadedKey(requestKey); } });
    return () => { cancelled = true; };
  }, [schoolId, caseId, requestKey]);

  async function refresh() { setVersion((current) => current + 1); }
  async function mutate(action: () => Promise<unknown>, successTitle: string, successDescription: string) {
    setBusy(true); setError('');
    try { await action(); setNote(''); toast.add({ type: 'success', title: successTitle, description: successDescription }); await refresh(); }
    catch (cause) { const detail = failureMessage(cause); setError(detail); toast.add({ type: 'error', title: 'Could not update admission case', description: detail, priority: 'high' }); }
    finally { setBusy(false); }
  }
  async function saveApplication(input: Parameters<typeof updateAdmissionCase>[2]) { await mutate(() => updateAdmissionCase(schoolId, caseId, input), 'Application saved', 'The application details were updated.'); }
  async function startReview() { await mutate(() => reviewAdmissionCase(schoolId, caseId, 'start_review'), 'Review started', 'The case is now under review.'); }
  async function submit() { await mutate(() => transitionAdmissionCase(schoolId, caseId, 'submit'), 'Application submitted', 'The application is ready for staff review.'); }
  async function changeToDraft() { await mutate(() => reviewAdmissionCase(schoolId, caseId, 'return_to_draft', note), 'Returned to draft', 'The case can be edited again.'); setReturnOpen(false); }
  async function decide() { await mutate(() => decideAdmissionCase(schoolId, caseId, decision, note), decision === 'accept' ? 'Application accepted' : 'Application rejected', 'The decision and reason were recorded.'); setDecisionOpen(false); }
  async function withdraw() { await mutate(() => withdrawAdmissionCase(schoolId, caseId, note), 'Case withdrawn', 'The case was withdrawn.'); setWithdrawOpen(false); }
  async function convert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!record) return;
    const newGuardianCount = record.guardians.filter((guardian) => !guardian.guardianProfileId).length;
    const codes = guardianCodes.split(',').map((value) => value.trim()).filter(Boolean);
    await mutate(() => admitAdmissionCase(schoolId, caseId, {
      ...(record.existingStudentId ? { existingStudentId: record.existingStudentId } : { studentCode }),
      schoolEnrollment: { admissionNumber, admissionDate },
      academicEnrollment: { sessionId: placementSessionId, classId: placementClassId, sectionId: placementSectionId, rollNumber: rollNumber || null, startDate },
      ...(newGuardianCount ? { guardianCodes: codes } : {}),
    }), 'Student admitted', 'The student, guardian links, and initial enrollment were created together.');
    setConvertOpen(false);
  }

  const loading = !schoolsLoaded || Boolean(schoolId && loadedKey !== requestKey);
  if (loading) return <Skeleton className="h-96 w-full" aria-label="Loading admission case" />;
  if (!record || !schoolId || !school?.canReadAdmissions) return <div className="flex flex-col gap-5"><div className="page-heading"><div><div className="breadcrumb"><Link href="/admissions">Admissions</Link><ChevronRight size={14} /><strong>Case</strong></div><h1>Admission case</h1></div></div><Alert variant={error ? 'destructive' : undefined}><AlertTitle>{error ? 'Could not load this case' : 'Case access unavailable'}</AlertTitle><AlertDescription>{error || 'Choose a school where your role can view admissions.'}</AlertDescription></Alert></div>;

  const canEdit = school.canManageAdmissions && ['enquiry', 'draft'].includes(record.status);
  const canReview = school.canManageAdmissions;
  const canConvert = school.canConvertAdmissions && record.status === 'accepted';
  const noteRequired = note.trim().length === 0;

  return <div className="flex flex-col gap-6">
    <div className="page-heading"><div><div className="breadcrumb"><Link href={`/admissions?school=${schoolId}`}>Admissions</Link><ChevronRight size={14} /><strong>{record.caseReference}</strong></div><h1>{record.studentPreferredName || record.studentGivenName || 'Applicant'} {record.studentFamilyName ?? ''}</h1><p>{school.name} · Case {record.caseReference}</p></div><div className="flex flex-wrap items-center gap-2"><Badge variant={statusVariant(record.status)}>{record.status.replaceAll('_', ' ')}</Badge><Button variant="outline" nativeButton={false} render={<Link href={`/admissions?school=${schoolId}`} />}>Back to worklist</Button></div></div>
    {error && <Alert variant="destructive"><AlertTitle>Could not complete the action</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.8fr)]">
      <div className="flex flex-col gap-6">
        <Card><CardHeader><CardTitle>Application details</CardTitle><CardDescription>Applicant details stay attached to the case after a decision or admission.</CardDescription></CardHeader><CardContent>
          {canEdit ? <ApplicationEditor key={`${record.id}-${record.updatedAt}`} record={record} setup={setup} busy={busy} onSave={saveApplication} /> : <div className="grid gap-4 text-sm sm:grid-cols-2">
            <p><strong>Student:</strong> {[record.studentPreferredName || record.studentGivenName, record.studentMiddleName, record.studentFamilyName].filter(Boolean).join(' ') || 'Not provided'}</p><p><strong>Date of birth:</strong> {dateLabel(record.studentDateOfBirth)}</p>
            <p><strong>Email:</strong> {record.studentEmail || '—'}</p><p><strong>Phone:</strong> {record.studentPhone || '—'}</p><p><strong>Requested session:</strong> {setup?.sessions.find((item) => item.id === record.requestedSessionId)?.name ?? '—'}</p>
            {record.existingStudentId && <p><strong>Linked student:</strong> <Link className="text-primary underline underline-offset-4" href={`/students/${record.existingStudentId}?school=${schoolId}`}>View student profile</Link></p>}
            <div className="sm:col-span-2"><h3 className="mb-2 font-semibold">Guardians</h3>{record.guardians.length ? <ul className="flex flex-col gap-2">{record.guardians.map((guardian) => <li key={guardian.id} className="rounded-md border p-3"><strong>{guardian.givenName} {guardian.familyName}</strong><span className="ml-2 text-muted-foreground">{guardian.relationshipType.replaceAll('_', ' ')}</span><div className="text-muted-foreground">{guardian.email || guardian.phone || 'No contact details provided'}</div></li>)}</ul> : <p className="text-muted-foreground">No guardian details recorded.</p>}</div>
            {record.reviewNote && <p className="sm:col-span-2"><strong>Staff notes:</strong> {record.reviewNote}</p>}
          </div>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Case history</CardTitle><CardDescription>Every review and status change is recorded.</CardDescription></CardHeader><CardContent>{events.length ? <ol className="flex flex-col gap-4">{events.map((event) => <li key={event.id} className="flex gap-3 border-l-2 border-primary/30 pl-4"><div><p className="font-medium">{eventLabel(event.eventType)} <span className="text-muted-foreground">{event.fromStatus ? `· ${event.fromStatus.replaceAll('_', ' ')} → ` : '· '}{event.toStatus.replaceAll('_', ' ')}</span></p><p className="text-sm text-muted-foreground">{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.createdAt))}</p></div></li>)}</ol> : <p className="text-sm text-muted-foreground">No case history is available yet.</p>}</CardContent></Card>
      </div>
      <div className="flex flex-col gap-6"><Card><CardHeader><CardTitle>Next action</CardTitle><CardDescription>Each action advances or closes the application workflow.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">
        {canReview && record.status === 'enquiry' && <Button disabled={busy} onClick={() => void mutate(() => transitionAdmissionCase(schoolId, caseId, 'draft'), 'Draft created', 'Application details can now be completed.')}><ClipboardCheck data-icon="inline-start" />Move to draft</Button>}
        {canReview && record.status === 'draft' && <Button disabled={busy} onClick={() => void submit()}><Send data-icon="inline-start" />Submit for review</Button>}
        {canReview && record.status === 'submitted' && <Button disabled={busy} onClick={() => void startReview()}><ClipboardCheck data-icon="inline-start" />Start review</Button>}
        {canReview && ['submitted', 'under_review'].includes(record.status) && <Button variant="outline" disabled={busy} onClick={() => { setNote(''); setReturnOpen(true); }}><RotateCcw data-icon="inline-start" />Return to draft</Button>}
        {canReview && record.status === 'under_review' && <div className="grid grid-cols-2 gap-2"><Button disabled={busy} onClick={() => { setDecision('accept'); setNote(''); setDecisionOpen(true); }}><UserCheck data-icon="inline-start" />Accept</Button><Button variant="destructive" disabled={busy} onClick={() => { setDecision('reject'); setNote(''); setDecisionOpen(true); }}><UserX data-icon="inline-start" />Reject</Button></div>}
        {canReview && ['enquiry', 'draft', 'submitted', 'under_review'].includes(record.status) && <Button variant="outline" disabled={busy} onClick={() => { setNote(''); setWithdrawOpen(true); }}>Withdraw case</Button>}
        {canConvert && <Button disabled={busy} onClick={() => setConvertOpen(true)}>Admit student</Button>}
        {record.status === 'admitted' && record.convertedStudentId && <Button variant="outline" nativeButton={false} render={<Link href={`/students/${record.convertedStudentId}?school=${schoolId}`} />}>View student profile</Button>}
        {!canReview && !canConvert && record.status !== 'admitted' && <p className="text-sm text-muted-foreground">Your role can view this case but cannot make the next change.</p>}
        {['rejected', 'withdrawn'].includes(record.status) && <p className="text-sm text-muted-foreground">This case is closed. Its application and history remain available.</p>}
      </CardContent></Card></div>
    </div>
    <Dialog open={returnOpen} onOpenChange={setReturnOpen}><DialogContent><DialogHeader><DialogTitle>Return application to draft?</DialogTitle><DialogDescription>Staff can edit the application again. A reason will be recorded in the case history.</DialogDescription></DialogHeader><Field><FieldLabel htmlFor={noteId}>Reason</FieldLabel><Textarea id={noteId} value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} /></Field><DialogFooter><Button variant="outline" onClick={() => setReturnOpen(false)}>Cancel</Button><Button disabled={busy || noteRequired} onClick={() => void changeToDraft()}>Return to draft</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={decisionOpen} onOpenChange={setDecisionOpen}><DialogContent><DialogHeader><DialogTitle>{decision === 'accept' ? 'Accept application?' : 'Reject application?'}</DialogTitle><DialogDescription>A decision note is required and will be saved with the case history.</DialogDescription></DialogHeader><Field><FieldLabel htmlFor={`${noteId}-decision`}>Decision note</FieldLabel><Textarea id={`${noteId}-decision`} value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} /></Field><DialogFooter><Button variant="outline" onClick={() => setDecisionOpen(false)}>Cancel</Button><Button variant={decision === 'reject' ? 'destructive' : 'default'} disabled={busy || noteRequired} onClick={() => void decide()}>{decision === 'accept' ? 'Accept application' : 'Reject application'}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}><DialogContent><DialogHeader><DialogTitle>Withdraw this case?</DialogTitle><DialogDescription>The case will be closed and retained in the history.</DialogDescription></DialogHeader><Field><FieldLabel htmlFor={`${noteId}-withdraw`}>Reason for withdrawal</FieldLabel><Textarea id={`${noteId}-withdraw`} value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} /></Field><DialogFooter><Button variant="outline" onClick={() => setWithdrawOpen(false)}>Cancel</Button><Button variant="destructive" disabled={busy || noteRequired} onClick={() => void withdraw()}>Withdraw case</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={convertOpen} onOpenChange={setConvertOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Admit {record.studentPreferredName || record.studentGivenName || 'this applicant'}?</DialogTitle><DialogDescription>This creates the student record, guardian relationships, school admission, and initial class placement in one transaction.</DialogDescription></DialogHeader>
      <form onSubmit={convert}><FieldGroup>
        {!record.existingStudentId && <Field><FieldLabel htmlFor={studentCodeId}>Student code</FieldLabel><Input id={studentCodeId} value={studentCode} onChange={(event) => setStudentCode(event.target.value)} maxLength={20} required /></Field>}
        <Field><FieldLabel htmlFor={admissionNumberId}>Admission number</FieldLabel><Input id={admissionNumberId} value={admissionNumber} onChange={(event) => setAdmissionNumber(event.target.value)} maxLength={40} required /></Field>
        <DateField id="admission-date" label="Admission date" value={admissionDate} onChange={setAdmissionDate} />
        <div className="grid gap-4 sm:grid-cols-3"><Field><FieldLabel htmlFor={sessionId}>Academic session</FieldLabel><Select value={placementSessionId || '__none__'} onValueChange={(next) => { setPlacementSessionId(next === '__none__' ? '' : next ?? ''); setPlacementClassId(''); setPlacementSectionId(''); }} items={[{ label: 'Choose session', value: '__none__' }, ...(setup?.sessions ?? []).filter((item) => item.status !== 'archived').map((item) => ({ label: item.name, value: item.id }))]}><SelectTrigger id={sessionId} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="__none__">Choose session</SelectItem>{(setup?.sessions ?? []).filter((item) => item.status !== 'archived').map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
          <Field><FieldLabel htmlFor={classId}>Class</FieldLabel><Select value={placementClassId || '__none__'} onValueChange={(next) => { setPlacementClassId(next === '__none__' ? '' : next ?? ''); setPlacementSectionId(''); }} items={[{ label: 'Choose class', value: '__none__' }, ...classes.map((item) => ({ label: item.name, value: item.id }))]}><SelectTrigger id={classId} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="__none__">Choose class</SelectItem>{classes.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
          <Field><FieldLabel htmlFor={sectionId}>Section</FieldLabel><Select value={placementSectionId || '__none__'} onValueChange={(next) => setPlacementSectionId(next === '__none__' ? '' : next ?? '')} items={[{ label: 'Choose section', value: '__none__' }, ...sections.map((item) => ({ label: item.name, value: item.id }))]}><SelectTrigger id={sectionId} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="__none__">Choose section</SelectItem>{sections.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
        </div>
        <Field><FieldLabel htmlFor={rollId}>Roll number (optional)</FieldLabel><Input id={rollId} value={rollNumber} onChange={(event) => setRollNumber(event.target.value)} maxLength={40} /></Field>
        <DateField id="academic-start-date" label="Placement start date" value={startDate} onChange={setStartDate} />
        {record.guardians.some((guardian) => !guardian.guardianProfileId) && <Field><FieldLabel htmlFor="guardian-codes">Guardian codes (comma separated)</FieldLabel><Input id="guardian-codes" value={guardianCodes} onChange={(event) => setGuardianCodes(event.target.value)} maxLength={220} placeholder="GUARD-001, GUARD-002" required /><p className="text-sm text-muted-foreground">Enter one code for each new guardian: {record.guardians.filter((guardian) => !guardian.guardianProfileId).length} needed.</p></Field>}
        <DialogFooter><Button type="button" variant="outline" onClick={() => setConvertOpen(false)}>Cancel</Button><Button type="submit" disabled={busy || !admissionNumber.trim() || !admissionDate || !startDate || !placementSessionId || !placementClassId || !placementSectionId}>{busy ? 'Admitting…' : 'Confirm admission'}</Button></DialogFooter>
      </FieldGroup></form>
    </DialogContent></Dialog>
  </div>;
}
