'use client';

import { useDeferredValue, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Plus, Search } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Pagination, PaginationContent, PaginationItem } from '@/components/ui/pagination';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DateField } from '../academic-setup/date-field';
import { getAcademicSetup, type AcademicSetup } from '@/lib/academics-api';
import { listAdmissionCases, listAdmissionSchools, type AdmissionCase, type AdmissionFilters, type AdmissionPage, type AdmissionSchool, type AdmissionStatus } from '@/lib/admissions-api';

const statuses: AdmissionStatus[] = ['enquiry', 'draft', 'submitted', 'under_review', 'accepted', 'rejected', 'withdrawn', 'admitted'];
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Admissions cases could not be loaded.';
const statusVariant = (status: AdmissionStatus) => status === 'accepted' || status === 'admitted' ? 'default' : status === 'rejected' || status === 'withdrawn' ? 'destructive' : status === 'under_review' ? 'secondary' : 'outline';

function DirectorySelect({ id, label, value, options, onChange, emptyLabel }: { id: string; label: string; value: string; options: { id: string; name: string }[]; onChange: (value: string) => void; emptyLabel: string }) {
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><Select items={[{ label: emptyLabel, value: '__all__' }, ...options.map((item) => ({ label: item.name, value: item.id }))]} value={value || '__all__'} onValueChange={(next) => onChange(next === '__all__' ? '' : next ?? '')}>
    <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="__all__">{emptyLabel}</SelectItem>{options.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent>
  </Select></Field>;
}

export function AdmissionsClient() {
  const [schools, setSchools] = useState<AdmissionSchool[]>([]); const [schoolId, setSchoolId] = useState('');
  const [setup, setSetup] = useState<AcademicSetup | null>(null); const [query, setQuery] = useState(''); const deferredQuery = useDeferredValue(query);
  const [status, setStatus] = useState(''); const [sessionId, setSessionId] = useState(''); const [createdFrom, setCreatedFrom] = useState(''); const [createdTo, setCreatedTo] = useState('');
  const [cursors, setCursors] = useState<string[]>([]); const cursor = cursors.at(-1) ?? '';
  const [page, setPage] = useState<AdmissionPage | null>(null); const [pageKey, setPageKey] = useState(''); const [loadingSchools, setLoadingSchools] = useState(true); const [error, setError] = useState('');
  const schoolControlId = useId(); const statusControlId = useId(); const sessionControlId = useId();
  const key = `${schoolId}|${deferredQuery}|${status}|${sessionId}|${createdFrom}|${createdTo}|${cursor}`; const loadingPage = Boolean(schoolId && pageKey !== key);
  const selectedSchool = schools.find((school) => school.id === schoolId); const sessions = setup?.sessions ?? [];

  useEffect(() => {
    let cancelled = false;
    listAdmissionSchools().then((items) => {
      if (cancelled) return;
      const eligible = items.filter((item) => item.canReadAdmissions || item.canManageAdmissions || item.canConvertAdmissions);
      setSchools(eligible);
      const requested = new URLSearchParams(window.location.search).get('school');
      setSchoolId(eligible.find((item) => item.id === requested)?.id ?? eligible[0]?.id ?? '');
    }).catch((cause) => { if (!cancelled) setError(errorMessage(cause)); }).finally(() => { if (!cancelled) setLoadingSchools(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;
    getAcademicSetup(schoolId).then((value) => { if (!cancelled) setSetup(value); }).catch(() => { if (!cancelled) setSetup(null); });
    return () => { cancelled = true; };
  }, [schoolId]);

  useEffect(() => {
    if (!schoolId || !selectedSchool?.canReadAdmissions) return;
    let cancelled = false;
    const filters: AdmissionFilters = { q: deferredQuery || undefined, status: status as AdmissionStatus || undefined, requestedSessionId: sessionId || undefined, createdFrom: createdFrom || undefined, createdTo: createdTo || undefined, cursor: cursor || undefined, limit: 25 };
    listAdmissionCases(schoolId, filters).then((result) => { if (!cancelled) { setPage(result); setPageKey(key); setError(''); } })
      .catch((cause) => { if (!cancelled) { setPage(null); setPageKey(key); setError(errorMessage(cause)); } });
    return () => { cancelled = true; };
  }, [schoolId, selectedSchool?.canReadAdmissions, deferredQuery, status, sessionId, createdFrom, createdTo, cursor, key]);

  function resetFilters(nextSchool: string) { setSchoolId(nextSchool); setQuery(''); setStatus(''); setSessionId(''); setCreatedFrom(''); setCreatedTo(''); setCursors([]); setPage(null); setSetup(null); }
  function resetCursor() { setCursors([]); }

  return <div className="flex flex-col gap-6">
    <div className="page-heading"><div><div className="breadcrumb"><span>School management</span><ChevronRight size={14} /><strong>Admissions</strong></div><h1>Admissions</h1><p>Track enquiries and applications through review and admission.</p></div>
      {selectedSchool?.canManageAdmissions && <Button nativeButton={false} render={<Link href={`/admissions/new?school=${schoolId}`} />}><Plus data-icon="inline-start" />New enquiry</Button>}
    </div>
    {error && <Alert variant="destructive"><AlertTitle>Could not load admissions</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {loadingSchools ? <Skeleton className="h-64 w-full" aria-label="Loading schools" /> : schools.length === 0 ? <Alert><AlertTitle>No admissions access</AlertTitle><AlertDescription>Your active workspace does not have access to admissions at a school.</AlertDescription></Alert> : <Card>
      <CardHeader><CardTitle>Admissions worklist</CardTitle><CardDescription>Search cases, narrow by stage or requested session, and open a record to continue processing.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
          <DirectorySelect id={schoolControlId} label="School" value={schoolId} options={schools} onChange={resetFilters} emptyLabel="Choose school" />
          <Field className="xl:col-span-2"><FieldLabel htmlFor="admission-search">Search cases</FieldLabel><div className="relative"><Search aria-hidden="true" className="absolute left-2 top-2 size-4 text-muted-foreground" /><Input id="admission-search" className="pl-8" value={query} onChange={(event) => { setQuery(event.target.value); resetCursor(); }} placeholder="Name or case number" /></div></Field>
          <DirectorySelect id={statusControlId} label="Status" value={status} options={statuses.map((value) => ({ id: value, name: value.replaceAll('_', ' ') }))} onChange={(value) => { setStatus(value); resetCursor(); }} emptyLabel="All statuses" />
          <DirectorySelect id={sessionControlId} label="Requested session" value={sessionId} options={sessions.map((item) => ({ id: item.id, name: item.name }))} onChange={(value) => { setSessionId(value); resetCursor(); }} emptyLabel="All sessions" />
          <DateField id="created-from" label="Created from" value={createdFrom} onChange={(value) => { setCreatedFrom(value); resetCursor(); }} required={false} />
          <DateField id="created-to" label="Created to" value={createdTo} onChange={(value) => { setCreatedTo(value); resetCursor(); }} required={false} />
        </div>
        {selectedSchool && !selectedSchool.canReadAdmissions ? <Alert><AlertTitle>Read access is unavailable</AlertTitle><AlertDescription>You can manage or convert admissions here, but your role does not include viewing the worklist.</AlertDescription></Alert>
          : loadingPage ? <Skeleton className="h-48 w-full" aria-label="Loading admissions" />
          : page?.items.length ? <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Case</TableHead><TableHead>Applicant</TableHead><TableHead>Requested session</TableHead><TableHead>Created</TableHead><TableHead>Status</TableHead><TableHead><span className="sr-only">Open case</span></TableHead></TableRow></TableHeader><TableBody>
            {page.items.map((item: AdmissionCase) => <TableRow key={item.id}><TableCell className="font-medium">{item.caseReference}</TableCell><TableCell>{[item.studentPreferredName || item.studentGivenName, item.studentFamilyName].filter(Boolean).join(' ') || 'Applicant details pending'}</TableCell><TableCell>{sessions.find((session) => session.id === item.requestedSessionId)?.name ?? '—'}</TableCell><TableCell>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(item.createdAt))}</TableCell><TableCell><Badge variant={statusVariant(item.status)}>{item.status.replaceAll('_', ' ')}</Badge></TableCell><TableCell><Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/admissions/${item.id}?school=${schoolId}`} />}>Open</Button></TableCell></TableRow>)}
          </TableBody></Table></div> : !error && <Empty><EmptyHeader><EmptyTitle>No admission cases found</EmptyTitle><EmptyDescription>Try another filter or create the first enquiry for this school.</EmptyDescription></EmptyHeader><EmptyContent>{selectedSchool?.canManageAdmissions && <Button nativeButton={false} render={<Link href={`/admissions/new?school=${schoolId}`} />}>Create enquiry</Button>}</EmptyContent></Empty>}
        {!loadingPage && (cursors.length > 0 || page?.nextCursor) && <Pagination><PaginationContent><PaginationItem><Button variant="outline" disabled={!cursors.length} onClick={() => setCursors((current) => current.slice(0, -1))}>Previous</Button></PaginationItem><PaginationItem><span className="px-3 text-sm text-foreground">Page {cursors.length + 1}</span></PaginationItem><PaginationItem><Button variant="outline" disabled={!page?.nextCursor} onClick={() => { if (page?.nextCursor) setCursors((current) => [...current, page.nextCursor!]); }}>Next</Button></PaginationItem></PaginationContent></Pagination>}
      </CardContent>
    </Card>}
  </div>;
}
