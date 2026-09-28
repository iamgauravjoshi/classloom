// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimetableClient } from './timetable-client';

const timetableApi = vi.hoisted(() => ({
  listTimetableSchools: vi.fn(), readTimetable: vi.fn(), createTimetableSlot: vi.fn(),
  updateTimetableSlot: vi.fn(), deleteTimetableSlot: vi.fn(), publishTimetable: vi.fn(),
}));
const academicsApi = vi.hoisted(() => ({ getAcademicSetup: vi.fn() }));
vi.mock('@/lib/timetable-api', () => timetableApi);
vi.mock('@/lib/academics-api', () => academicsApi);

const school = { id: 'school-a', name: 'North School', code: 'NORTH', canReadTimetable: true, canManageTimetable: true };
const session = { id: 'session-a', schoolId: 'school-a', name: '2026–27', code: '2026', startDate: '2026-04-01', endDate: '2027-03-31', status: 'active' };
const section = { id: 'section-a', sessionId: 'session-a', classId: 'class-a', name: 'A', code: 'A', capacity: null };
const subject = { id: 'subject-a', sessionId: 'session-a', name: 'Mathematics', code: 'MATH' };
const assignment = { id: 'assignment-a', sessionId: 'session-a', sectionId: 'section-a', subjectId: 'subject-a', membershipId: 'teacher-a' };
const slot = { id: 'slot-a', sessionId: 'session-a', sectionId: 'section-a', subjectId: 'subject-a', teacherAssignmentId: 'assignment-a', teacherMembershipId: 'teacher-a', weekday: 1, startTime: '09:00:00', endTime: '09:40:00', roomLabel: 'Room 1' };
const schedule = { timetable: { id: 'timetable-a', status: 'published' }, slots: [slot], options: {
  sections: [{ id: section.id, className: 'Grade 8', name: 'A', label: 'Grade 8 · A' }],
  subjects: [{ id: subject.id, name: subject.name, code: subject.code }],
  teacherAssignments: [{ ...assignment, displayName: 'Taylor Teacher' }],
} };

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  timetableApi.listTimetableSchools.mockResolvedValue([school]);
  timetableApi.readTimetable.mockResolvedValue(schedule);
  academicsApi.getAcademicSetup.mockResolvedValue({ school: { id: 'school-a', name: 'North School', code: 'NORTH' }, sessions: [session], classes: [], sections: [section], subjects: [subject], assignments: [assignment] });
  timetableApi.createTimetableSlot.mockResolvedValue({ ...slot, id: 'slot-new' });
  timetableApi.updateTimetableSlot.mockResolvedValue(slot);
  timetableApi.deleteTimetableSlot.mockResolvedValue({ deleted: true });
  timetableApi.publishTimetable.mockResolvedValue({ id: 'timetable-a', status: 'published' });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('timetable workspace', () => {
  it('shows schedule details, manager actions, and a narrow weekday selector', async () => {
    render(<TimetableClient />);
    expect((await screen.findAllByText('Mathematics')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Taylor Teacher').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Published').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Add slot' })).toBeTruthy();
    expect(screen.getByRole('tablist', { name: 'Timetable weekday' })).toBeTruthy();
  });

  it('applies a section filter to the timetable request', async () => {
    const user = userEvent.setup();
    render(<TimetableClient />);
    await screen.findAllByText('Mathematics');
    await user.click(screen.getByLabelText('Section'));
    await user.click(await screen.findByRole('option', { name: 'Grade 8 · A' }));
    await waitFor(() => expect(timetableApi.readTimetable).toHaveBeenLastCalledWith('school-a', 'session-a', { sectionId: 'section-a', teacherMembershipId: undefined }));
  });

  it('switches the narrow timetable to the selected weekday', async () => {
    const user = userEvent.setup();
    render(<TimetableClient />);
    await screen.findAllByText('Mathematics');
    const tuesday = screen.getByRole('tab', { name: 'Tuesday' });
    await user.click(tuesday);
    expect(tuesday.getAttribute('aria-selected')).toBe('true');
  });

  it('shows the published timetable warning when a manager opens an edit form', async () => {
    render(<TimetableClient />);
    await screen.findAllByText('Mathematics');
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit Mathematics' })[0]!);
    expect(await screen.findByText(/readers will not see changes until you publish again/i)).toBeTruthy();
  });

  it('submits a new slot and reports a server conflict in the form', async () => {
    timetableApi.createTimetableSlot.mockRejectedValueOnce(new Error('This time overlaps another slot for the same section'));
    render(<TimetableClient />);
    await screen.findAllByText('Mathematics');
    fireEvent.click(screen.getByRole('button', { name: 'Add slot' }));
    expect(await screen.findByText(/readers will not see changes until you publish again/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '10:00' } });
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '10:40' } });
    fireEvent.submit(document.querySelector('form')!);
    expect((await screen.findAllByText('This time overlaps another slot for the same section')).length).toBeGreaterThan(0);
    expect(timetableApi.createTimetableSlot).toHaveBeenCalledWith('school-a', 'session-a', expect.objectContaining({ startTime: '10:00', endTime: '10:40' }));
  });

  it('publishes a draft timetable explicitly', async () => {
    const user = userEvent.setup();
    timetableApi.readTimetable.mockResolvedValue({ ...schedule, timetable: { id: 'timetable-a', status: 'draft' } });
    render(<TimetableClient />);
    await screen.findAllByText('Mathematics');
    await user.click(screen.getByRole('button', { name: 'Publish timetable' }));
    await waitFor(() => expect(timetableApi.publishTimetable).toHaveBeenCalledWith('school-a', 'session-a'));
  });

  it('shows an empty state for a reader before the first publication', async () => {
    timetableApi.listTimetableSchools.mockResolvedValue([{ ...school, canManageTimetable: false }]);
    timetableApi.readTimetable.mockResolvedValue({ ...schedule, timetable: null, slots: [] });
    render(<TimetableClient />);
    expect(await screen.findByText('No published timetable yet')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add slot' })).toBeNull();
  });

  it('explains when academic setup has no session for a timetable', async () => {
    academicsApi.getAcademicSetup.mockResolvedValue({ school: { id: 'school-a', name: 'North School', code: 'NORTH' }, sessions: [] });
    render(<TimetableClient />);
    expect(await screen.findByText('No academic sessions yet')).toBeTruthy();
    expect(timetableApi.readTimetable).not.toHaveBeenCalled();
  });

  it('reports timetable loading errors clearly', async () => {
    timetableApi.listTimetableSchools.mockRejectedValue(new Error('Schedule service unavailable'));
    render(<TimetableClient />);
    expect(await screen.findByText('Schedule service unavailable')).toBeTruthy();
  });
});
