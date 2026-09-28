'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { CalendarDays, CircleDollarSign, ReceiptText } from 'lucide-react';
import {
  assignFeePlan, createFeeHead, createFeeLine, createFeePlan, decimalToMinor, formatMinor,
  getFeeSetup, grantFeeConcession, listFeeOutstanding, listFinanceEnrollments, listFinanceSchools,
  readFeeReceipt, readFeeStatement, recordFeePayment, reverseFeePayment,
  type FeeReceipt, type FeeSetup, type FeeStatement, type FinanceEnrollment, type FinanceSchool,
} from '@/lib/finance-api';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';

const errorText = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed. Please try again.';
const schoolTime = (value: string, timezone: string) => new Intl.DateTimeFormat('en-US', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' }).format(parseISO(value));

function Choice({ label, value, placeholder, options, onChange, disabled }: {
  label: string; value: string; placeholder: string; options: { id: string; name: string }[];
  onChange: (value: string) => void; disabled?: boolean;
}) {
  const id = useId();
  const items = [{ value: '__none__', label: placeholder }, ...options.map((item) => ({ value: item.id, label: item.name }))];
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Select items={items} value={value || '__none__'} onValueChange={(next) => onChange(next === '__none__' ? '' : next ?? '')} disabled={disabled}>
      <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent><SelectGroup>{items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>
  </Field>;
}

function TextField({ label, name, placeholder, required = true }: { label: string; name: string; placeholder?: string; required?: boolean }) {
  const id = useId();
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><Input id={id} name={name} placeholder={placeholder} required={required} /></Field>;
}

function FormCard({ title, description, submitLabel, busy, disabled, paused, onSubmit, children }: {
  title: string; description: string; submitLabel: string; busy: boolean; disabled?: boolean; paused?: boolean;
  onSubmit: (form: FormData) => Promise<void>; children: React.ReactNode;
}) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
    <CardContent><form className="flex flex-col gap-4" onSubmit={(event) => {
      event.preventDefault(); void onSubmit(new FormData(event.currentTarget));
    }}>{children}<Button type="submit" disabled={busy || disabled || paused}>{paused ? 'Refresh balances to continue' : busy ? 'Saving…' : submitLabel}</Button></form></CardContent>
  </Card>;
}

export function FeesClient() {
  const [schools, setSchools] = useState<FinanceSchool[]>([]);
  const [schoolId, setSchoolId] = useState('');
  const [setup, setSetup] = useState<FeeSetup | null>(null);
  const [enrollments, setEnrollments] = useState<FinanceEnrollment[]>([]);
  const [outstanding, setOutstanding] = useState<{ schoolEnrollmentId: string; outstandingMinor: string }[]>([]);
  const [enrollmentId, setEnrollmentId] = useState('');
  const [statement, setStatement] = useState<FeeStatement | null>(null);
  const [receipt, setReceipt] = useState<FeeReceipt | null>(null);
  const [planSessionId, setPlanSessionId] = useState('');
  const [planClassId, setPlanClassId] = useState('');
  const [linePlanId, setLinePlanId] = useState('');
  const [lineHeadId, setLineHeadId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dateOpen, setDateOpen] = useState(false);
  const [assignmentPlanId, setAssignmentPlanId] = useState('');
  const [chargeId, setChargeId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [concessionChargeId, setConcessionChargeId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshPending, setRefreshPending] = useState(false);
  const [error, setError] = useState('');
  const paymentKey = useRef('');
  const paymentFingerprint = useRef('');
  const completedPayment = useRef<{ fingerprint: string; receipt: FeeReceipt } | null>(null);
  const school = schools.find((item) => item.id === schoolId);
  const currency = school?.currency ?? 'INR';
  const academic = setup?.academic;
  const selectedEnrollment = enrollments.find((item) => item.id === enrollmentId);
  const planClasses = useMemo(() => academic?.classes.filter((item) => item.sessionId === planSessionId) ?? [], [academic, planSessionId]);
  const linePlan = setup?.plans.find((item) => item.id === linePlanId);
  const lineSession = academic?.sessions.find((item) => item.id === linePlan?.sessionId);

  useEffect(() => {
    let current = true;
    void listFinanceSchools().then((items) => { if (current) { setSchools(items); setSchoolId(items[0]?.id ?? ''); if (!items.length) setLoading(false); } })
      .catch((failure) => { if (current) { const message = errorText(failure); setError(message); setLoading(false); toast.add({ type: 'error', title: 'Could not load finance schools', description: message, priority: 'high' }); } });
    return () => { current = false; };
  }, []);

  async function refreshSchool(id: string) {
    const [newSetup, newEnrollments, newOutstanding] = await Promise.all([
      getFeeSetup(id), listFinanceEnrollments(id), listFeeOutstanding(id),
    ]);
    setSetup(newSetup); setEnrollments(newEnrollments); setOutstanding(newOutstanding);
  }

  useEffect(() => {
    if (!schoolId) return;
    let current = true;
    void Promise.all([getFeeSetup(schoolId), listFinanceEnrollments(schoolId), listFeeOutstanding(schoolId)])
      .then(([newSetup, newEnrollments, newOutstanding]) => {
        if (current) { setSetup(newSetup); setEnrollments(newEnrollments); setOutstanding(newOutstanding); setLoading(false); setError(''); }
      }).catch((failure) => { if (current) { const message = errorText(failure); setError(message); setLoading(false); toast.add({ type: 'error', title: 'Could not load fees', description: message, priority: 'high' }); } });
    return () => { current = false; };
  }, [schoolId]);

  useEffect(() => {
    if (!schoolId || !enrollmentId) return;
    let current = true;
    void readFeeStatement(schoolId, enrollmentId).then((data) => { if (current) setStatement(data); })
      .catch((failure) => { if (current) { const message = errorText(failure); setError(message); toast.add({ type: 'error', title: 'Could not load statement', description: message, priority: 'high' }); } });
    return () => { current = false; };
  }, [schoolId, enrollmentId]);

  async function mutate(title: string, action: () => Promise<unknown>, afterWrite?: () => void) {
    if (!schoolId) return;
    setBusy(true); setError('');
    try {
      await action(); afterWrite?.(); setRefreshPending(true);
      toast.add({ type: 'success', title });
      try {
        await refreshSchool(schoolId);
        if (enrollmentId) setStatement(await readFeeStatement(schoolId, enrollmentId));
        setRefreshPending(false);
      } catch (refreshError) {
        const message = `${title}, but balances could not refresh: ${errorText(refreshError)}`;
        setError(message); toast.add({ type: 'error', title: 'Balance refresh failed', description: message, priority: 'high' });
      }
    } catch (failure) {
      const message = errorText(failure); setError(message);
      toast.add({ type: 'error', title: `Could not ${title.toLowerCase()}`, description: message, priority: 'high' });
    } finally { setBusy(false); }
  }

  function selectSchool(next: string) {
    setLoading(Boolean(next)); setSetup(null); setEnrollments([]); setOutstanding([]);
    setSchoolId(next); setEnrollmentId(''); setStatement(null); setReceipt(null); setPlanSessionId(''); setPlanClassId('');
    setLinePlanId(''); setLineHeadId(''); setAssignmentPlanId(''); setChargeId(''); setConcessionChargeId(''); setDueDate(''); paymentKey.current = ''; paymentFingerprint.current = ''; completedPayment.current = null;
  }

  function selectEnrollment(next: string) { setEnrollmentId(next); setStatement(null); setReceipt(null); setChargeId(''); setConcessionChargeId(''); paymentKey.current = ''; paymentFingerprint.current = ''; completedPayment.current = null; }

  async function retryRefresh() {
    if (!schoolId) return;
    setBusy(true);
    try {
      await refreshSchool(schoolId);
      if (enrollmentId) setStatement(await readFeeStatement(schoolId, enrollmentId));
      setRefreshPending(false); setError('');
      toast.add({ type: 'success', title: 'Balances refreshed' });
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }

  if (loading && !school) return <div className="flex flex-col gap-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-28 w-full" /><Skeleton className="h-64 w-full" /></div>;

  return <div className="flex flex-col gap-6">
    <div className="page-heading"><div><div className="breadcrumb"><span>School Management</span><CircleDollarSign aria-hidden="true" size={14} /><strong>Fees & Payments</strong></div>
      <h1>Fees & Payments</h1><p>Set fees, follow student balances, and record offline receipts.</p></div></div>
    {error && <Alert variant="destructive"><AlertTitle>Finance action needs attention</AlertTitle><AlertDescription className="flex flex-col gap-2">{error}{refreshPending && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void retryRefresh()}>Retry balance refresh</Button>}</AlertDescription></Alert>}
    {!schools.length ? <Empty><EmptyHeader><EmptyTitle>No finance schools available</EmptyTitle><EmptyDescription>Ask a school administrator for finance access.</EmptyDescription></EmptyHeader></Empty> : <>
      <Card><CardHeader><CardTitle>School context</CardTitle><CardDescription>Financial records are kept separately for each school and currency.</CardDescription></CardHeader>
        <CardContent className="max-w-md"><Choice label="School" value={schoolId} placeholder="Choose school" options={schools.map((item) => ({ id: item.id, name: item.name }))} onChange={selectSchool} disabled={busy || refreshPending} /></CardContent></Card>
      {loading ? <Skeleton className="h-72 w-full" /> : <Tabs defaultValue="accounts" className="w-full">
        <TabsList className="flex-wrap"><TabsTrigger value="accounts">Student accounts</TabsTrigger><TabsTrigger value="outstanding">Outstanding</TabsTrigger><TabsTrigger value="setup">Fee setup</TabsTrigger></TabsList>
        <TabsContent value="accounts" className="flex flex-col gap-4">
          <Card><CardHeader><CardTitle>Student statement</CardTitle><CardDescription>Select an enrolled student to view charges, credits, and receipt history.</CardDescription></CardHeader>
            <CardContent className="max-w-lg"><Choice label="Student enrollment" value={enrollmentId} placeholder="Choose student" options={enrollments.map((item) => ({ id: item.id, name: `${item.givenName} ${item.familyName} · ${item.admissionNumber}` }))} onChange={selectEnrollment} /></CardContent></Card>
          {selectedEnrollment && statement && <>
            <Card><CardHeader><CardTitle>{selectedEnrollment.givenName} {selectedEnrollment.familyName}</CardTitle><CardDescription>Admission {selectedEnrollment.admissionNumber} · Outstanding {formatMinor(statement.outstandingMinor, currency)}</CardDescription></CardHeader>
              <CardContent>{!statement.charges.length ? <Empty><EmptyHeader><EmptyTitle>No charges yet</EmptyTitle><EmptyDescription>Assign a fee plan to issue charges for this student.</EmptyDescription></EmptyHeader></Empty> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Charge</TableHead><TableHead>Due</TableHead><TableHead>Original</TableHead><TableHead>Outstanding</TableHead></TableRow></TableHeader>
                <TableBody>{statement.charges.map((charge) => <TableRow key={charge.id}><TableCell>{charge.description}</TableCell><TableCell>{format(parseISO(charge.dueDate), 'PP')}</TableCell><TableCell>{formatMinor(charge.amountMinor, currency)}</TableCell><TableCell><Badge variant={charge.outstandingMinor === '0' ? 'secondary' : 'outline'}>{formatMinor(charge.outstandingMinor, currency)}</Badge></TableCell></TableRow>)}</TableBody></Table></div>}</CardContent></Card>
            {statement.charges.some((item) => item.outstandingMinor !== '0') && <div className="grid gap-4 xl:grid-cols-2">
              {school?.canRecord && <FormCard title="Record offline payment" description="Record a payment against one charge. Retry keeps the same payment key if the network fails." submitLabel="Record payment" busy={busy} paused={refreshPending} disabled={!chargeId} onSubmit={async (form) => {
                setBusy(true);
                try {
                  const details = { schoolEnrollmentId: enrollmentId, method: paymentMethod, reference: String(form.get('reference') ?? ''),
                    allocations: [{ chargeId, amountMinor: decimalToMinor(String(form.get('amount')), currency) }] };
                  const fingerprint = JSON.stringify(details);
                  if (paymentFingerprint.current !== fingerprint) { paymentFingerprint.current = fingerprint; paymentKey.current = crypto.randomUUID(); }
                  const result = completedPayment.current?.fingerprint === fingerprint
                    ? completedPayment.current.receipt
                    : await recordFeePayment(schoolId, { ...details, idempotencyKey: paymentKey.current });
                  completedPayment.current = { fingerprint, receipt: result };
                  setReceipt(result);
                  toast.add({ type: 'success', title: `Receipt #${result.receiptNumber} recorded` });
                  try {
                    await refreshSchool(schoolId); setStatement(await readFeeStatement(schoolId, enrollmentId));
                    setChargeId(''); paymentKey.current = ''; paymentFingerprint.current = ''; completedPayment.current = null;
                  } catch (refreshError) {
                    const message = `Receipt #${result.receiptNumber} was recorded, but the statement could not refresh: ${errorText(refreshError)}`;
                    setRefreshPending(true); setError(message); toast.add({ type: 'error', title: 'Statement refresh failed', description: message, priority: 'high' });
                  }
                } catch (failure) { const message = errorText(failure); setError(message); toast.add({ type: 'error', title: 'Could not record payment', description: message, priority: 'high' }); }
                finally { setBusy(false); }
              }}>
                <Choice label="Charge" value={chargeId} placeholder="Choose charge" options={statement.charges.filter((item) => item.outstandingMinor !== '0').map((item) => ({ id: item.id, name: `${item.description} · ${formatMinor(item.outstandingMinor, currency)}` }))} onChange={(next) => { setChargeId(next); paymentKey.current = ''; }} />
                <TextField label={`Amount (${currency})`} name="amount" placeholder="0.00" />
                <Choice label="Method" value={paymentMethod} placeholder="Choose method" options={[{ id: 'cash', name: 'Cash' }, { id: 'bank_transfer', name: 'Bank transfer' }, { id: 'cheque', name: 'Cheque' }, { id: 'card_terminal', name: 'Card terminal' }, { id: 'other', name: 'Other' }]} onChange={(next) => { setPaymentMethod(next); paymentKey.current = ''; }} />
                <TextField label="Reference (optional)" name="reference" required={false} />
              </FormCard>}
              {school?.canAdjust && <FormCard title="Grant concession" description="This credit is permanent and needs a reason." submitLabel="Grant concession" busy={busy} paused={refreshPending} disabled={!concessionChargeId} onSubmit={async (form) => mutate('Concession granted', () => grantFeeConcession(schoolId, {
                schoolEnrollmentId: enrollmentId, chargeId: concessionChargeId, amountMinor: decimalToMinor(String(form.get('amount')), currency), reason: String(form.get('reason')),
              }), () => setConcessionChargeId(''))}>
                <Choice label="Charge" value={concessionChargeId} placeholder="Choose charge" options={statement.charges.filter((item) => item.outstandingMinor !== '0').map((item) => ({ id: item.id, name: item.description }))} onChange={setConcessionChargeId} />
                <TextField label={`Amount (${currency})`} name="amount" placeholder="0.00" /><TextField label="Reason" name="reason" />
              </FormCard>}
            </div>}
            <Card><CardHeader><CardTitle>Ledger activity</CardTitle><CardDescription>Charges and adjustments remain in the history.</CardDescription></CardHeader><CardContent>
              {!statement.entries.length ? <p className="text-muted-foreground">No activity yet.</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Amount</TableHead><TableHead>Details</TableHead></TableRow></TableHeader>
                <TableBody>{statement.entries.map((entry) => <TableRow key={entry.id}><TableCell>{schoolTime(entry.createdAt, school?.timezone ?? 'UTC')}</TableCell><TableCell>{entry.kind.replaceAll('_', ' ')}</TableCell><TableCell>{formatMinor(entry.amountMinor, currency)}</TableCell><TableCell>{entry.paymentId ? <Button size="sm" variant="link" type="button" onClick={() => void readFeeReceipt(schoolId, entry.paymentId!).then(setReceipt).catch((failure) => setError(errorText(failure)))}>View receipt</Button> : entry.reason ?? '—'}</TableCell></TableRow>)}</TableBody></Table></div>}
            </CardContent></Card>
          </>}
          {receipt && <Card><CardHeader><CardTitle><ReceiptText className="inline" aria-hidden="true" /> Receipt #{receipt.receiptNumber}</CardTitle><CardDescription>{receipt.reversed ? 'Reversed' : 'Recorded'} · {schoolTime(receipt.createdAt, school?.timezone ?? 'UTC')}</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3"><p>{formatMinor(receipt.amountMinor, receipt.currency)} · {receipt.method.replaceAll('_', ' ')}{receipt.reference ? ` · ${receipt.reference}` : ''}</p>
              {receipt.reversed && <p>Reversal reason: {receipt.reversalReason}</p>}
              {school?.canAdjust && !receipt.reversed && <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); const reason = String(new FormData(event.currentTarget).get('reason')); void mutate('Receipt reversed', async () => { setReceipt(await reverseFeePayment(schoolId, receipt.id, reason)); }); }}>
                <TextField label="Reversal reason" name="reason" /><Button type="submit" variant="destructive" disabled={busy || refreshPending}>Reverse receipt</Button>
              </form>}
            </CardContent></Card>}
        </TabsContent>
        <TabsContent value="outstanding"><Card><CardHeader><CardTitle>Outstanding balances</CardTitle><CardDescription>Balances are calculated from the school ledger, including reversals.</CardDescription></CardHeader><CardContent>
          {!outstanding.length ? <Empty><EmptyHeader><EmptyTitle>No outstanding balances</EmptyTitle><EmptyDescription>Issued charges and payments will appear here.</EmptyDescription></EmptyHeader></Empty> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Admission number</TableHead><TableHead>Outstanding</TableHead></TableRow></TableHeader><TableBody>{outstanding.map((item) => {
            const student = enrollments.find((enrollment) => enrollment.id === item.schoolEnrollmentId);
            return <TableRow key={item.schoolEnrollmentId}><TableCell>{student ? `${student.givenName} ${student.familyName}` : item.schoolEnrollmentId}</TableCell><TableCell>{student?.admissionNumber ?? '—'}</TableCell><TableCell>{formatMinor(item.outstandingMinor, currency)}</TableCell></TableRow>;
          })}</TableBody></Table></div>}
        </CardContent></Card></TabsContent>
        <TabsContent value="setup" className="flex flex-col gap-4">
          <div className="grid gap-4 xl:grid-cols-2">
            {school?.canManage && <>
              <FormCard title="Fee head" description="Create a reusable category such as tuition or transport." submitLabel="Add fee head" busy={busy} paused={refreshPending} onSubmit={async (form) => mutate('Fee head added', () => createFeeHead(schoolId, { code: String(form.get('code')), name: String(form.get('name')) }))}>
                <TextField label="Code" name="code" placeholder="TUITION" /><TextField label="Name" name="name" placeholder="Tuition" />
              </FormCard>
              <FormCard title="Fee plan" description="A plan belongs to one academic class and session." submitLabel="Create plan" busy={busy} paused={refreshPending} disabled={!planSessionId || !planClassId} onSubmit={async (form) => mutate('Fee plan created', () => createFeePlan(schoolId, { sessionId: planSessionId, classId: planClassId, name: String(form.get('name')) }))}>
                <Choice label="Academic session" value={planSessionId} placeholder="Choose session" options={academic?.sessions.map((item) => ({ id: item.id, name: item.name })) ?? []} onChange={(next) => { setPlanSessionId(next); setPlanClassId(''); }} />
                <Choice label="Class" value={planClassId} placeholder="Choose class" options={planClasses.map((item) => ({ id: item.id, name: item.name }))} onChange={setPlanClassId} disabled={!planSessionId} />
                <TextField label="Plan name" name="name" placeholder="Annual fees" />
              </FormCard>
              <FormCard title="Plan line" description="Set the fee category, installment label, due date, and exact amount." submitLabel="Add line" busy={busy} paused={refreshPending} disabled={!linePlanId || !lineHeadId || !dueDate} onSubmit={async (form) => mutate('Fee line added', () => createFeeLine(schoolId, linePlanId, { headId: lineHeadId, label: String(form.get('label')), dueDate, amountMinor: decimalToMinor(String(form.get('amount')), currency) }))}>
                <Choice label="Plan" value={linePlanId} placeholder="Choose plan" options={setup?.plans.map((item) => ({ id: item.id, name: item.name })) ?? []} onChange={(next) => { setLinePlanId(next); setDueDate(''); }} />
                <Choice label="Fee head" value={lineHeadId} placeholder="Choose head" options={setup?.heads.map((item) => ({ id: item.id, name: item.name })) ?? []} onChange={setLineHeadId} />
                <TextField label="Installment label" name="label" placeholder="Term 1" />
                <Field><FieldLabel htmlFor="fee-due-date">Due date</FieldLabel><Popover open={dateOpen} onOpenChange={setDateOpen}>
                  <PopoverTrigger render={<Button id="fee-due-date" type="button" variant="outline" className="w-full justify-start font-normal" />}><CalendarDays data-icon="inline-start" />{dueDate ? format(parseISO(dueDate), 'PP') : 'Choose due date'}</PopoverTrigger>
                  <PopoverContent align="start" className="w-auto p-0"><Calendar mode="single" selected={dueDate ? parseISO(dueDate) : undefined} onSelect={(date) => { if (date) { setDueDate(format(date, 'yyyy-MM-dd')); setDateOpen(false); } }} disabled={(date) => !lineSession || format(date, 'yyyy-MM-dd') < lineSession.startDate || format(date, 'yyyy-MM-dd') > lineSession.endDate} /></PopoverContent>
                </Popover></Field>
                <TextField label={`Amount (${currency})`} name="amount" placeholder="0.00" />
              </FormCard>
              <FormCard title="Assign and issue" description="Charges are issued immediately and cannot be edited after assignment." submitLabel="Issue charges" busy={busy} paused={refreshPending} disabled={!assignmentPlanId || !enrollmentId} onSubmit={async () => mutate('Charges issued', () => assignFeePlan(schoolId, assignmentPlanId, enrollmentId))}>
                <Choice label="Plan" value={assignmentPlanId} placeholder="Choose plan" options={setup?.plans.map((item) => ({ id: item.id, name: item.name })) ?? []} onChange={setAssignmentPlanId} />
                <Choice label="Student enrollment" value={enrollmentId} placeholder="Choose student" options={enrollments.filter((item) => item.status === 'active').map((item) => ({ id: item.id, name: `${item.givenName} ${item.familyName} · ${item.admissionNumber}` }))} onChange={selectEnrollment} />
              </FormCard>
            </>}
          </div>
          <Card><CardHeader><CardTitle>Configured plans</CardTitle><CardDescription>Lines are fixed once a plan has been assigned.</CardDescription></CardHeader><CardContent>
            {!setup?.plans.length ? <Empty><EmptyHeader><EmptyTitle>No fee plans</EmptyTitle><EmptyDescription>Create a fee head and plan to begin.</EmptyDescription></EmptyHeader></Empty> : <div className="grid gap-3 sm:grid-cols-2">{setup.plans.map((plan) => <div key={plan.id} className="rounded-lg border p-4"><strong>{plan.name}</strong><p className="text-sm text-muted-foreground">{academic?.sessions.find((item) => item.id === plan.sessionId)?.name} · {academic?.classes.find((item) => item.id === plan.classId)?.name}</p><ul className="mt-2 flex flex-col gap-1 text-sm">{setup.lines.filter((line) => line.planId === plan.id).map((line) => <li key={line.id}>{line.label}: {formatMinor(line.amountMinor, currency)} · {format(parseISO(line.dueDate), 'PP')}</li>)}</ul></div>)}</div>}
          </CardContent></Card>
        </TabsContent>
      </Tabs>}
    </>}
  </div>;
}
