'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { getAcademicSetup, type AcademicSetup } from '@/lib/academics-api';
import { createAdmissionCase, listAdmissionSchools, type AdmissionGuardian, type AdmissionSchool } from '@/lib/admissions-api';
import { DateField } from '../../academic-setup/date-field';

const failureMessage = (cause: unknown) => cause instanceof Error ? cause.message : 'The enquiry could not be saved. Please try again.';
const relationships = ['mother', 'father', 'legal_guardian', 'grandparent', 'sibling', 'other'] as const;
type GuardianFlags = Pick<AdmissionGuardian, 'primaryContact' | 'emergencyContact' | 'authorizedPickup' | 'financialResponsibility' | 'portalAccess'>;
const emptyFlags: GuardianFlags = { primaryContact: false, emergencyContact: false, authorizedPickup: false, financialResponsibility: false, portalAccess: false };

export function NewAdmissionForm() {
  const router = useRouter(); const [schools, setSchools] = useState<AdmissionSchool[]>([]); const [schoolId, setSchoolId] = useState(''); const [setup, setSetup] = useState<AcademicSetup | null>(null);
  const [dateOfBirth, setDateOfBirth] = useState(''); const [guardianCount, setGuardianCount] = useState(1); const [guardianTypes, setGuardianTypes] = useState<string[]>(['mother']);
  const [guardianFlags, setGuardianFlags] = useState<GuardianFlags[]>([{ ...emptyFlags }]); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [requestedSessionId, setRequestedSessionId] = useState(''); const [requestedClassId, setRequestedClassId] = useState(''); const [requestedSectionId, setRequestedSectionId] = useState('');
  const titleId = useId();
  const classes = setup?.classes.filter((item) => item.sessionId === requestedSessionId) ?? [];
  const sections = setup?.sections.filter((item) => item.classId === requestedClassId) ?? [];
  const manageableSchools = schools.filter((school) => school.canManageAdmissions);

  useEffect(() => {
    let cancelled = false;
    listAdmissionSchools().then((items) => {
      if (cancelled) return;
      const eligible = items.filter((school) => school.canManageAdmissions);
      setSchools(eligible);
      const requested = new URLSearchParams(window.location.search).get('school');
      setSchoolId(eligible.find((school) => school.id === requested)?.id ?? eligible[0]?.id ?? '');
    }).catch((cause) => { if (!cancelled) setError(failureMessage(cause)); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;
    getAcademicSetup(schoolId).then((value) => { if (!cancelled) setSetup(value); }).catch(() => { if (!cancelled) setSetup(null); });
    return () => { cancelled = true; };
  }, [schoolId]);

  function changeSchool(next: string) { setSchoolId(next); setSetup(null); setRequestedSessionId(''); setRequestedClassId(''); setRequestedSectionId(''); }
  function addGuardian() {
    if (guardianCount >= 10) return;
    setGuardianCount((current) => current + 1); setGuardianTypes((current) => [...current, 'mother']); setGuardianFlags((current) => [...current, { ...emptyFlags }]);
  }
  function removeGuardian(index: number) {
    setGuardianCount((count) => count - 1); setGuardianTypes((types) => types.filter((_, position) => position !== index)); setGuardianFlags((flags) => flags.filter((_, position) => position !== index));
  }
  function setFlag(index: number, key: keyof GuardianFlags, checked: boolean) { setGuardianFlags((current) => current.map((flags, position) => position === index ? { ...flags, [key]: checked } : flags)); }

  async function save(status: 'enquiry' | 'draft', form: HTMLFormElement) {
    if (!schoolId || busy) return;
    setBusy(true); setError('');
    const data = new FormData(form); const value = (name: string) => String(data.get(name) ?? '').trim() || null;
    try {
      const created = await createAdmissionCase(schoolId, {
        status, studentGivenName: value('studentGivenName'), studentMiddleName: value('studentMiddleName'), studentFamilyName: value('studentFamilyName'),
        studentPreferredName: value('studentPreferredName'), studentDateOfBirth: dateOfBirth || null, studentGender: value('studentGender'), existingStudentId: value('existingStudentId'),
        studentEmail: value('studentEmail'), studentPhone: value('studentPhone'), requestedSessionId: requestedSessionId || null,
        requestedClassId: requestedClassId || null, requestedSectionId: requestedSectionId || null, reviewNote: value('reviewNote'),
        guardians: Array.from({ length: guardianCount }, (_, index) => ({
          guardianProfileId: value(`guardianProfileId-${index}`),
          givenName: value(`guardianGivenName-${index}`) ?? '', familyName: value(`guardianFamilyName-${index}`) ?? '',
          middleName: value(`guardianMiddleName-${index}`), preferredName: value(`guardianPreferredName-${index}`), email: value(`guardianEmail-${index}`),
          phone: value(`guardianPhone-${index}`), occupation: value(`guardianOccupation-${index}`), relationshipType: guardianTypes[index] as AdmissionGuardian['relationshipType'], ...guardianFlags[index],
        })).filter((guardian) => guardian.givenName || guardian.familyName),
      });
      toast.add({ type: 'success', title: status === 'draft' ? 'Draft saved' : 'Enquiry created', description: `${created.caseReference} is ready for staff follow-up.` });
      router.push(`/admissions/${created.id}?school=${schoolId}`);
    } catch (cause) {
      const detail = failureMessage(cause); setError(detail); toast.add({ type: 'error', title: 'Could not save admission case', description: detail, priority: 'high' });
    } finally { setBusy(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void save('enquiry', event.currentTarget); }

  return <div className="flex flex-col gap-6">
    <div className="page-heading"><div><div className="breadcrumb"><Link href="/admissions">Admissions</Link><ChevronRight size={14} /><strong>New enquiry</strong></div><h1>New enquiry</h1><p>Capture the family’s initial details. You can complete the application before submitting it for review.</p></div></div>
    {error && <Alert variant="destructive"><AlertTitle>Could not save the enquiry</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {!manageableSchools.length ? <Alert><AlertTitle>No school access</AlertTitle><AlertDescription>Your role cannot create admissions cases at a school.</AlertDescription></Alert> : <form onSubmit={submit}>
      <div className="flex flex-col gap-6">
        <Card><CardHeader><CardTitle id={titleId}>Applicant and school</CardTitle><CardDescription>Start with the student details you know. Enquiry fields can be completed later.</CardDescription></CardHeader><CardContent><FieldGroup>
          <Field><FieldLabel htmlFor="admission-school">School</FieldLabel><Select items={manageableSchools.map((school) => ({ label: school.name, value: school.id }))} value={schoolId || null} onValueChange={(next) => changeSchool(next ?? '')}><SelectTrigger id="admission-school" className="w-full"><SelectValue placeholder="Choose school" /></SelectTrigger><SelectContent><SelectGroup>{manageableSchools.map((school) => <SelectItem key={school.id} value={school.id}>{school.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
          <div className="grid gap-4 md:grid-cols-2"><Field><FieldLabel htmlFor="student-given-name">Student given name</FieldLabel><Input id="student-given-name" name="studentGivenName" maxLength={120} /></Field><Field><FieldLabel htmlFor="student-family-name">Student family name</FieldLabel><Input id="student-family-name" name="studentFamilyName" maxLength={120} /></Field>
            <Field><FieldLabel htmlFor="student-middle-name">Middle name</FieldLabel><Input id="student-middle-name" name="studentMiddleName" maxLength={120} /></Field><Field><FieldLabel htmlFor="student-preferred-name">Preferred name</FieldLabel><Input id="student-preferred-name" name="studentPreferredName" maxLength={120} /></Field>
            <DateField id="student-date-of-birth" label="Date of birth" value={dateOfBirth} onChange={setDateOfBirth} required={false} />
            <Field><FieldLabel htmlFor="student-gender">Gender (optional)</FieldLabel><Input id="student-gender" name="studentGender" maxLength={50} /></Field>
            <Field><FieldLabel htmlFor="student-email">Student email (optional)</FieldLabel><Input id="student-email" name="studentEmail" type="email" maxLength={254} /></Field><Field><FieldLabel htmlFor="student-phone">Student phone (optional)</FieldLabel><Input id="student-phone" name="studentPhone" type="tel" maxLength={30} /></Field>
            <Field className="md:col-span-2"><FieldLabel htmlFor="existing-student-id">Existing student profile ID (optional)</FieldLabel><Input id="existing-student-id" name="existingStudentId" placeholder="Paste the ID from the student profile URL" /><FieldDescription>Use this when the enquiry is for a student already in ClassLoom.</FieldDescription></Field>
          </div>
          <div className="grid gap-4 md:grid-cols-3"><Field><FieldLabel htmlFor="requested-session">Requested session</FieldLabel><Select items={[{ label: 'Optional', value: '__none__' }, ...(setup?.sessions ?? []).map((item) => ({ label: item.name, value: item.id }))]} value={requestedSessionId || '__none__'} onValueChange={(next) => { setRequestedSessionId(next === '__none__' ? '' : next ?? ''); setRequestedClassId(''); setRequestedSectionId(''); }}><SelectTrigger id="requested-session" className="w-full"><SelectValue placeholder="Optional" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="__none__">Optional</SelectItem>{(setup?.sessions ?? []).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
            <Field><FieldLabel htmlFor="requested-class">Requested class</FieldLabel><Select items={[{ label: 'Optional', value: '__none__' }, ...classes.map((item) => ({ label: item.name, value: item.id }))]} value={requestedClassId || '__none__'} onValueChange={(next) => { setRequestedClassId(next === '__none__' ? '' : next ?? ''); setRequestedSectionId(''); }}><SelectTrigger id="requested-class" className="w-full"><SelectValue placeholder="Optional" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="__none__">Optional</SelectItem>{classes.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
            <Field><FieldLabel htmlFor="requested-section">Requested section</FieldLabel><Select items={[{ label: 'Optional', value: '__none__' }, ...sections.map((item) => ({ label: item.name, value: item.id }))]} value={requestedSectionId || '__none__'} onValueChange={(next) => setRequestedSectionId(next === '__none__' ? '' : next ?? '')}><SelectTrigger id="requested-section" className="w-full"><SelectValue placeholder="Optional" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="__none__">Optional</SelectItem>{sections.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
          </div>
          <Field><FieldLabel htmlFor="review-note">Staff notes (optional)</FieldLabel><Input id="review-note" name="reviewNote" maxLength={500} /></Field>
        </FieldGroup></CardContent></Card>
        <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>Guardians</CardTitle><CardDescription>Add guardian and contact details when available.</CardDescription></div><Button type="button" variant="outline" size="sm" onClick={addGuardian} disabled={guardianCount >= 10}><Plus data-icon="inline-start" />Add guardian</Button></div></CardHeader><CardContent className="flex flex-col gap-5">
          {Array.from({ length: guardianCount }, (_, index) => <fieldset key={index} className="rounded-lg border p-4"><legend className="px-1 text-sm font-semibold">Guardian {index + 1}</legend><div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor={`guardian-given-${index}`}>Given name</FieldLabel><Input id={`guardian-given-${index}`} name={`guardianGivenName-${index}`} maxLength={120} /></Field><Field><FieldLabel htmlFor={`guardian-family-${index}`}>Family name</FieldLabel><Input id={`guardian-family-${index}`} name={`guardianFamilyName-${index}`} maxLength={120} /></Field>
              <Field><FieldLabel htmlFor={`guardian-middle-${index}`}>Middle name</FieldLabel><Input id={`guardian-middle-${index}`} name={`guardianMiddleName-${index}`} maxLength={120} /></Field><Field><FieldLabel htmlFor={`guardian-preferred-${index}`}>Preferred name</FieldLabel><Input id={`guardian-preferred-${index}`} name={`guardianPreferredName-${index}`} maxLength={120} /></Field>
              <Field><FieldLabel htmlFor={`guardian-email-${index}`}>Email</FieldLabel><Input id={`guardian-email-${index}`} name={`guardianEmail-${index}`} type="email" maxLength={254} /></Field><Field><FieldLabel htmlFor={`guardian-phone-${index}`}>Phone</FieldLabel><Input id={`guardian-phone-${index}`} name={`guardianPhone-${index}`} type="tel" maxLength={30} /></Field>
              <Field><FieldLabel htmlFor={`guardian-occupation-${index}`}>Occupation</FieldLabel><Input id={`guardian-occupation-${index}`} name={`guardianOccupation-${index}`} maxLength={120} /></Field>
              <Field className="sm:col-span-2"><FieldLabel htmlFor={`guardian-profile-id-${index}`}>Existing guardian profile ID (optional)</FieldLabel><Input id={`guardian-profile-id-${index}`} name={`guardianProfileId-${index}`} placeholder="Paste the ID from the guardian profile URL" /></Field>
              <Field><FieldLabel htmlFor={`guardian-relationship-${index}`}>Relationship</FieldLabel><Select value={guardianTypes[index] ?? 'other'} onValueChange={(next) => setGuardianTypes((current) => current.map((value, position) => position === index ? next ?? 'other' : value))} items={relationships.map((value) => ({ label: value.replaceAll('_', ' '), value }))}><SelectTrigger id={`guardian-relationship-${index}`} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{relationships.map((value) => <SelectItem key={value} value={value}>{value.replaceAll('_', ' ')}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-3">{(['primaryContact', 'emergencyContact', 'authorizedPickup', 'financialResponsibility', 'portalAccess'] as const).map((key) => <label key={key} className="flex items-center gap-2 text-sm"><Checkbox checked={guardianFlags[index]?.[key]} onCheckedChange={(checked) => setFlag(index, key, checked === true)} />{key.replaceAll(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase())}</label>)}</div>
            {guardianCount > 1 && <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => removeGuardian(index)}><Trash2 data-icon="inline-start" />Remove guardian</Button>}
          </div></fieldset>)}
        </CardContent></Card>
        <div className="flex flex-wrap justify-end gap-3"><Button type="button" variant="outline" nativeButton={false} render={<Link href="/admissions" />}>Cancel</Button><Button type="button" variant="outline" disabled={busy || !schoolId} onClick={(event) => { const form = event.currentTarget.form; if (form) void save('draft', form); }}>{busy ? 'Saving…' : 'Save as draft'}</Button><Button type="submit" disabled={busy || !schoolId}>{busy ? 'Saving…' : 'Create enquiry'}</Button></div>
      </div>
    </form>}
  </div>;
}
