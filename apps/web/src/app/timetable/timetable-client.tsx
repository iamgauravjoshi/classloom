'use client';

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { AlertCircle, CalendarDays, Check, Clock3, MapPin, Pencil, Plus, Send, UserRound } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { ConfirmationDialog } from '@/components/confirmation-dialog';
import { getAcademicSetup, type AcademicSetup } from '@/lib/academics-api';
import {
  createTimetableSlot, deleteTimetableSlot, listTimetableSchools, publishTimetable, readTimetable, updateTimetableSlot,
  type TimetableData, type TimetableSchool, type TimetableSlot, type TimetableSlotInput,
} from '@/lib/timetable-api';

const weekdays = [
  { value: 1, label: 'Monday', short: 'Mon' }, { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' }, { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' }, { value: 6, label: 'Saturday', short: 'Sat' },
  { value: 7, label: 'Sunday', short: 'Sun' },
];
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'The timetable could not be loaded. Please try again.';
const localTime = (value: string) => value.slice(0, 5);
const noSections: TimetableData['options']['sections'] = [];
const noSubjects: TimetableData['options']['subjects'] = [];
const noAssignments: TimetableData['options']['teacherAssignments'] = [];

type SlotForm = { sectionId: string; subjectId: string; teacherAssignmentId: string; weekday: number; startTime: string; endTime: string; roomLabel: string };
const emptyForm = (weekday = 1): SlotForm => ({ sectionId: '', subjectId: '', teacherAssignmentId: '', weekday, startTime: '09:00', endTime: '09:40', roomLabel: '' });

function FilterSelect({ id, label, value, onChange, options, placeholder }: {
  id: string; label: string; value: string; onChange: (value: string) => void;
  options: { id: string; name: string }[]; placeholder: string;
}) {
  return <Field>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Select items={[{ label: placeholder, value: '__all__' }, ...options.map((item) => ({ label: item.name, value: item.id }))]} value={value || '__all__'} onValueChange={(next) => onChange(next === '__all__' ? '' : next ?? '')}>
      <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent><SelectGroup>
        <SelectItem value="__all__">{placeholder}</SelectItem>
        {options.map((option) => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}
      </SelectGroup></SelectContent>
    </Select>
  </Field>;
}

function SlotCard({
  slot, subjectName, sectionName, teacherName, canManage, onEdit, onDelete,
}: {
  slot: TimetableSlot; subjectName: string; sectionName: string; teacherName: string; canManage: boolean;
  onEdit: () => void; onDelete: () => void;
}) {
  return <article className="rounded-lg border bg-card p-3 shadow-sm">
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="truncate font-medium text-foreground">{subjectName}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{sectionName}</p>
      </div>
      {canManage && <div className="flex shrink-0 gap-1">
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Edit ${subjectName}`} onClick={onEdit}><Pencil /></Button>
        <ConfirmationDialog triggerLabel="Delete" title="Delete timetable slot?" description={`Remove ${subjectName} from this weekly timetable? The schedule will return to draft.`} confirmLabel="Delete slot" onConfirm={onDelete} />
      </div>}
    </div>
    <div className="mt-3 flex flex-col gap-1.5 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5 text-foreground"><Clock3 aria-hidden="true" />{localTime(slot.startTime)}–{localTime(slot.endTime)}</span>
      {teacherName ? <span className="inline-flex items-center gap-1.5"><UserRound aria-hidden="true" />{teacherName}</span> : <span className="inline-flex items-center gap-1.5"><UserRound aria-hidden="true" />Teacher unassigned</span>}
      {slot.roomLabel && <span className="inline-flex items-center gap-1.5"><MapPin aria-hidden="true" />{slot.roomLabel}</span>}
    </div>
  </article>;
}

export function TimetableClient() {
  const schoolControlId = useId(); const sessionControlId = useId(); const sectionControlId = useId(); const teacherControlId = useId();
  const [schools, setSchools] = useState<TimetableSchool[]>([]);
  const [schoolId, setSchoolId] = useState('');
  const [setup, setSetup] = useState<AcademicSetup | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [teacherMembershipId, setTeacherMembershipId] = useState('');
  const [loadedSchedule, setLoadedSchedule] = useState<{ key: string; data: TimetableData } | null>(null);
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [error, setError] = useState('');
  const [activeDay, setActiveDay] = useState('1');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<TimetableSlot | null>(null);
  const [form, setForm] = useState<SlotForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const activeScheduleRequest = useRef(0);

  const selectedSchool = schools.find((item) => item.id === schoolId);
  const canManage = Boolean(selectedSchool?.canManageTimetable);
  const requestKey = `${schoolId}|${sessionId}|${sectionId}|${teacherMembershipId}`;
  const timetable = loadedSchedule?.key === requestKey ? loadedSchedule.data : null;
  const loadingSetup = Boolean(schoolId && setup?.school?.id !== schoolId && !error);
  const loadingSchedule = Boolean(sessionId && setup?.school?.id === schoolId && !timetable && !error);
  const sessions = setup?.school?.id === schoolId ? setup.sessions : [];
  const sections = loadedSchedule?.data.options.sections ?? noSections;
  const subjects = loadedSchedule?.data.options.subjects ?? noSubjects;
  const assignments = loadedSchedule?.data.options.teacherAssignments ?? noAssignments;
  const teachers = useMemo(() => [...new Map(assignments.map((item) => [item.membershipId, item.displayName])).entries()]
    .map(([id, name]) => ({ id, name })), [assignments]);
  const subjectById = useMemo(() => new Map(subjects.map((item) => [item.id, item.name])), [subjects]);
  const sectionById = useMemo(() => new Map(sections.map((item) => [item.id, item.label])), [sections]);
  const teacherById = useMemo(() => new Map(teachers.map((item) => [item.id, item.name])), [teachers]);
  const slotsByDay = useMemo(() => {
    const result = new Map<number, TimetableSlot[]>();
    for (const day of weekdays) result.set(day.value, []);
    for (const slot of timetable?.slots ?? []) result.get(slot.weekday)?.push(slot);
    for (const slots of result.values()) slots.sort((left, right) => localTime(left.startTime).localeCompare(localTime(right.startTime)));
    return result;
  }, [timetable?.slots]);

  useEffect(() => {
    let cancelled = false;
    listTimetableSchools().then((items) => {
      if (cancelled) return;
      setSchools(items);
      setSchoolId(items[0]?.id ?? '');
    }).catch((cause) => {
      if (!cancelled) {
        const detail = errorMessage(cause); setError(detail);
        toast.add({ type: 'error', title: 'Could not load timetable schools', description: detail, priority: 'high' });
      }
    }).finally(() => { if (!cancelled) setLoadingSchools(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;
    getAcademicSetup(schoolId).then((value) => {
      if (cancelled) return;
      setSetup(value);
      setSessionId(value.sessions.find((item) => item.status === 'active')?.id ?? value.sessions.find((item) => item.status === 'draft')?.id ?? '');
    }).catch((cause) => {
      if (!cancelled) {
        const detail = errorMessage(cause); setError(detail);
        toast.add({ type: 'error', title: 'Could not load academic sessions', description: detail, priority: 'high' });
      }
    });
    return () => { cancelled = true; activeScheduleRequest.current += 1; };
  }, [schoolId]);

  useEffect(() => {
    if (!schoolId || !sessionId || setup?.school.id !== schoolId) return;
    const requestId = ++activeScheduleRequest.current;
    readTimetable(schoolId, sessionId, { sectionId: sectionId || undefined, teacherMembershipId: teacherMembershipId || undefined }).then((value) => {
      if (requestId === activeScheduleRequest.current) { setLoadedSchedule({ key: requestKey, data: value }); setError(''); }
    }).catch((cause: unknown) => {
      if (requestId === activeScheduleRequest.current) {
        const detail = errorMessage(cause); setLoadedSchedule(null); setError(detail);
        toast.add({ type: 'error', title: 'Could not load timetable', description: detail, priority: 'high' });
      }
    });
  }, [schoolId, sessionId, setup?.school.id, sectionId, teacherMembershipId, requestKey, refreshKey]);

  function openCreate() {
    setEditingSlot(null);
    setForm({ ...emptyForm(Number(activeDay)), sectionId: sections[0]?.id ?? '', subjectId: subjects[0]?.id ?? '' });
    setDialogOpen(true);
  }

  function changeSchool(value: string) {
    activeScheduleRequest.current += 1;
    setSchoolId(value); setSetup(null); setLoadedSchedule(null); setSessionId(''); setSectionId(''); setTeacherMembershipId(''); setError('');
  }

  function changeSession(value: string) {
    activeScheduleRequest.current += 1;
    setLoadedSchedule(null); setSessionId(value); setSectionId(''); setTeacherMembershipId(''); setError('');
  }

  function changeSection(value: string) {
    activeScheduleRequest.current += 1; setSectionId(value); setError('');
  }

  function changeTeacher(value: string) {
    activeScheduleRequest.current += 1; setTeacherMembershipId(value); setError('');
  }

  function openEdit(slot: TimetableSlot) {
    setEditingSlot(slot);
    setForm({ sectionId: slot.sectionId, subjectId: slot.subjectId, teacherAssignmentId: slot.teacherAssignmentId ?? '', weekday: slot.weekday,
      startTime: localTime(slot.startTime), endTime: localTime(slot.endTime), roomLabel: slot.roomLabel ?? '' });
    setDialogOpen(true);
  }

  async function submitSlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!schoolId || !sessionId) return;
    const input: TimetableSlotInput = { ...form, sessionId, teacherAssignmentId: form.teacherAssignmentId || null, roomLabel: form.roomLabel.trim() || null };
    setSaving(true); setError('');
    try {
      if (editingSlot) await updateTimetableSlot(schoolId, editingSlot.id, input);
      else await createTimetableSlot(schoolId, sessionId, input);
      setDialogOpen(false); setLoadedSchedule(null); setRefreshKey((value) => value + 1);
      toast.add({ type: 'success', title: 'Timetable saved', description: editingSlot ? 'The timetable slot was updated.' : 'The timetable slot was added.' });
    } catch (cause) {
      const detail = errorMessage(cause); setError(detail);
      toast.add({ type: 'error', title: 'Could not save timetable slot', description: detail, priority: 'high' });
    } finally { setSaving(false); }
  }

  async function removeSlot(slot: TimetableSlot) {
    if (!schoolId) return;
    try {
      await deleteTimetableSlot(schoolId, slot.id); setLoadedSchedule(null); setRefreshKey((value) => value + 1);
      toast.add({ type: 'success', title: 'Slot deleted', description: 'The timetable is now a draft and needs to be published again.' });
    } catch (cause) {
      const detail = errorMessage(cause); setError(detail);
      toast.add({ type: 'error', title: 'Could not delete timetable slot', description: detail, priority: 'high' });
    }
  }

  async function publish() {
    if (!schoolId || !sessionId) return;
    setSaving(true); setError('');
    try {
      await publishTimetable(schoolId, sessionId); setLoadedSchedule(null); setRefreshKey((value) => value + 1);
      toast.add({ type: 'success', title: 'Timetable published', description: 'Readers can now see this weekly schedule.' });
    } catch (cause) {
      const detail = errorMessage(cause); setError(detail);
      toast.add({ type: 'error', title: 'Could not publish timetable', description: detail, priority: 'high' });
    } finally { setSaving(false); }
  }

  function renderDay(dayValue: number) {
    const day = weekdays[dayValue - 1]!;
    const slots = slotsByDay.get(dayValue) ?? [];
    return <div className="flex min-h-56 flex-col gap-3" key={dayValue}>
      <div className="flex items-center justify-between border-b pb-2">
        <h2 className="text-sm font-semibold">{day.label}</h2><Badge variant="secondary">{slots.length}</Badge>
      </div>
      {slots.length ? slots.map((slot) => <SlotCard key={slot.id} slot={slot} subjectName={subjectById.get(slot.subjectId) ?? 'Subject'} sectionName={sectionById.get(slot.sectionId) ?? 'Section'} teacherName={slot.teacherMembershipId ? teacherById.get(slot.teacherMembershipId) ?? 'Assigned teacher' : ''} canManage={canManage} onEdit={() => openEdit(slot)} onDelete={() => void removeSlot(slot)} />)
        : <p className="py-4 text-center text-xs text-muted-foreground">No classes</p>}
    </div>;
  }

  return <div className="flex flex-col gap-6">
    <div className="page-heading flex-wrap">
      <div><div className="breadcrumb"><span>Academic</span><CalendarDays aria-hidden="true" size={14} /><strong>Timetable</strong></div>
        <h1>Timetable</h1><p>Build and publish the recurring weekly schedule for each school session.</p></div>
      {canManage && <div className="flex w-full flex-wrap gap-2 sm:w-auto">
        <Button type="button" variant="outline" disabled={!timetable || loadingSchedule || saving || timetable.timetable?.status === 'published'} onClick={() => void publish()}>
          {timetable?.timetable?.status === 'published' ? <Check data-icon="inline-start" /> : <Send data-icon="inline-start" />}
          {timetable?.timetable?.status === 'published' ? 'Published' : 'Publish timetable'}
        </Button>
        <Button type="button" disabled={!timetable || loadingSchedule || loadingSetup} onClick={openCreate}><Plus data-icon="inline-start" />Add slot</Button>
      </div>}
    </div>

    {error && <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>Could not complete the request</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {loadingSchools ? <Skeleton className="h-24 w-full" aria-label="Loading timetable schools" /> : schools.length === 0 ? <Empty>
      <EmptyHeader><EmptyTitle>No timetable access</EmptyTitle><EmptyDescription>Your active workspace does not have timetable access for any school.</EmptyDescription></EmptyHeader>
    </Empty> : <>
      <Card>
        <CardHeader><CardTitle>School and academic session</CardTitle><CardDescription>Choose the weekly schedule to view or manage.</CardDescription></CardHeader>
        <CardContent><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <FilterSelect id={schoolControlId} label="School" value={schoolId} onChange={changeSchool} options={schools.map(({ id, name }) => ({ id, name }))} placeholder="Choose school" />
          <FilterSelect id={sessionControlId} label="Academic session" value={sessionId} onChange={changeSession} options={sessions.map(({ id, name, status }) => ({ id, name: `${name} · ${status}` }))} placeholder={loadingSetup ? 'Loading sessions…' : 'Choose session'} />
          <FilterSelect id={sectionControlId} label="Section" value={sectionId} onChange={changeSection} options={sections.map((item) => ({ id: item.id, name: item.label }))} placeholder="All sections" />
          <FilterSelect id={teacherControlId} label="Teacher" value={teacherMembershipId} onChange={changeTeacher} options={teachers} placeholder="All teachers" />
        </div></CardContent>
      </Card>

      {!selectedSchool?.canReadTimetable && !canManage ? <Alert><AlertTitle>Read access is unavailable</AlertTitle><AlertDescription>Your role can manage this school&apos;s timetable but cannot view it.</AlertDescription></Alert>
        : loadingSetup ? <Skeleton className="h-[26rem] w-full" aria-label="Loading timetable" />
        : error && !setup ? null
        : sessions.length === 0 ? <Empty><EmptyHeader><EmptyTitle>No academic sessions yet</EmptyTitle><EmptyDescription>Create an academic session before setting up its weekly timetable.</EmptyDescription></EmptyHeader></Empty>
        : loadingSchedule ? <Skeleton className="h-[26rem] w-full" aria-label="Loading timetable" />
        : !timetable ? null
        : !timetable.timetable && !canManage ? <Empty>
          <EmptyHeader><EmptyTitle>No published timetable yet</EmptyTitle><EmptyDescription>This school has not published a weekly timetable for the selected academic session.</EmptyDescription></EmptyHeader>
        </Empty>
        : (timetable.slots.length === 0 && !canManage) ? <Empty>
          <EmptyHeader><EmptyTitle>No classes match these filters</EmptyTitle><EmptyDescription>Choose another section or teacher to see scheduled classes.</EmptyDescription></EmptyHeader>
        </Empty>
        : <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div><CardTitle>Weekly schedule</CardTitle><CardDescription>{selectedSchool?.name} · {sessions.find((item) => item.id === sessionId)?.name ?? 'Academic session'}</CardDescription></div>
            <Badge variant={timetable.timetable?.status === 'published' ? 'default' : 'secondary'}>{timetable.timetable?.status === 'published' ? 'Published' : 'Draft'}</Badge>
          </CardHeader>
          <CardContent>
            {timetable.slots.length === 0 ? <Empty>
              <EmptyHeader><EmptyTitle>No timetable slots yet</EmptyTitle><EmptyDescription>Add recurring class periods, then publish the timetable for readers.</EmptyDescription></EmptyHeader>
            </Empty> : <>
              <div className="hidden gap-3 md:grid md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                {weekdays.map((day) => <div key={day.value}>{renderDay(day.value)}</div>)}
              </div>
              <Tabs value={activeDay} onValueChange={(value) => setActiveDay(value ?? '1')} className="md:hidden">
                <TabsList aria-label="Timetable weekday" className="grid w-full grid-cols-7">
                  {weekdays.map((day) => <TabsTrigger key={day.value} value={String(day.value)} aria-label={day.label}>{day.short}</TabsTrigger>)}
                </TabsList>
                {weekdays.map((day) => <TabsContent key={day.value} value={String(day.value)} className="pt-4">{renderDay(day.value)}</TabsContent>)}
              </Tabs>
            </>}
          </CardContent>
        </Card>}
    </>}

    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{editingSlot ? 'Edit timetable slot' : 'Add timetable slot'}</DialogTitle>
          <DialogDescription>Set a recurring weekly class period for this session.</DialogDescription></DialogHeader>
        {timetable?.timetable?.status === 'published' && <Alert><AlertCircle aria-hidden="true" /><AlertTitle>Republish after saving</AlertTitle><AlertDescription>Readers will not see changes until you publish again. Saving a change returns this timetable to draft.</AlertDescription></Alert>}
        <form onSubmit={submitSlot}>
          <FieldGroup>
            <Field><FieldLabel htmlFor="slot-section">Section</FieldLabel><Select value={form.sectionId || '__none__'} onValueChange={(value) => setForm((current) => ({ ...current, sectionId: value === '__none__' ? '' : value ?? '', teacherAssignmentId: '' }))}>
              <SelectTrigger id="slot-section" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{sections.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
            </Select></Field>
            <Field><FieldLabel htmlFor="slot-subject">Subject</FieldLabel><Select value={form.subjectId || '__none__'} onValueChange={(value) => setForm((current) => ({ ...current, subjectId: value === '__none__' ? '' : value ?? '', teacherAssignmentId: '' }))}>
              <SelectTrigger id="slot-subject" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{subjects.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent>
            </Select></Field>
            <Field><FieldLabel htmlFor="slot-teacher">Teacher assignment <span className="text-muted-foreground">(optional)</span></FieldLabel><Select value={form.teacherAssignmentId || '__unassigned__'} onValueChange={(value) => setForm((current) => ({ ...current, teacherAssignmentId: value === '__unassigned__' ? '' : value ?? '' }))}>
              <SelectTrigger id="slot-teacher" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="__unassigned__">Unassigned</SelectItem>
                {assignments.filter((item) => item.sectionId === form.sectionId && item.subjectId === form.subjectId).map((item) => <SelectItem key={item.id} value={item.id}>{item.displayName}</SelectItem>)}
              </SelectGroup></SelectContent>
            </Select></Field>
            <Field><FieldLabel htmlFor="slot-weekday">Weekday</FieldLabel><Select value={String(form.weekday)} onValueChange={(value) => setForm((current) => ({ ...current, weekday: Number(value ?? 1) }))}>
              <SelectTrigger id="slot-weekday" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{weekdays.map((day) => <SelectItem key={day.value} value={String(day.value)}>{day.label}</SelectItem>)}</SelectGroup></SelectContent>
            </Select></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field><FieldLabel htmlFor="slot-start">Start time</FieldLabel><Input id="slot-start" type="time" required value={form.startTime} onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))} /></Field>
              <Field><FieldLabel htmlFor="slot-end">End time</FieldLabel><Input id="slot-end" type="time" required value={form.endTime} onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))} /></Field>
            </div>
            <Field><FieldLabel htmlFor="slot-room">Room <span className="text-muted-foreground">(optional)</span></FieldLabel><Input id="slot-room" maxLength={120} value={form.roomLabel} onChange={(event) => setForm((current) => ({ ...current, roomLabel: event.target.value }))} placeholder="e.g. Room 12" /></Field>
          </FieldGroup>
          {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.sectionId || !form.subjectId}>{saving ? 'Saving…' : editingSlot ? 'Save changes' : 'Add slot'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}
