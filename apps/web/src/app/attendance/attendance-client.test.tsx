// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AttendanceClient } from './attendance-client';

const attendanceApi = vi.hoisted(() => ({
  listAttendanceSchools: vi.fn(), listAttendanceSessions: vi.fn(), listAttendanceSections: vi.fn(),
  readAttendanceRegister: vi.fn(), saveAttendanceRegister: vi.fn(), listAttendanceEvents: vi.fn(),
}));
vi.mock('@/lib/attendance-api', () => attendanceApi);

const school = {
  id: 'school-a', name: 'North School', code: 'NORTH', timezone: 'America/Los_Angeles', today: '2026-09-28',
  canReadAttendance: true, canRecordAttendance: true,
};
const session = { id: 'session-a', name: '2026–27', code: '2026', startDate: '2026-04-01', endDate: '2027-03-31', status: 'active' };
const section = { id: 'section-a', classId: 'class-a', className: 'Grade 8', classCode: 'G8', name: 'A', code: 'A', label: 'Grade 8 · A' };
const student = { academicEnrollmentId: 'enrollment-a', studentId: 'student-a', rollNumber: '08', displayName: 'Asha Rao', status: null };
const register = { register: null, entries: [student], completion: { total: 1, present: 0, absent: 0, late: 0, excused: 0, unmarked: 1, complete: false } };

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  attendanceApi.listAttendanceSchools.mockResolvedValue([school]);
  attendanceApi.listAttendanceSessions.mockResolvedValue([session]);
  attendanceApi.listAttendanceSections.mockResolvedValue([section]);
  attendanceApi.readAttendanceRegister.mockResolvedValue(register);
  attendanceApi.saveAttendanceRegister.mockResolvedValue({
    register: { id: 'register-a' }, entries: [{ ...student, status: 'present' }],
    completion: { total: 1, present: 1, absent: 0, late: 0, excused: 0, unmarked: 0, complete: true },
  });
  attendanceApi.listAttendanceEvents.mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('attendance workspace', () => {
  it('loads the date-effective register with the shadcn calendar date control', async () => {
    render(<AttendanceClient />);
    expect((await screen.findAllByText('Asha Rao')).length).toBeGreaterThan(0);
    expect(attendanceApi.readAttendanceRegister).toHaveBeenCalledWith('school-a', 'session-a', '2026-09-28', 'section-a');
    expect(screen.getByRole('button', { name: 'Attendance date: September 28th, 2026' })).toBeTruthy();
    expect(document.querySelector('input[type="date"]')).toBeNull();
    expect(screen.getByText('1 unmarked')).toBeTruthy();
  });

  it('supports explicit bulk present marking and saves the complete roster', async () => {
    const user = userEvent.setup();
    render(<AttendanceClient />);
    await screen.findAllByText('Asha Rao');
    await user.click(screen.getByRole('button', { name: 'All present' }));
    expect(screen.getByText('Complete')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Save attendance' }));
    await waitFor(() => expect(attendanceApi.saveAttendanceRegister).toHaveBeenCalledWith('school-a', 'session-a', '2026-09-28', 'section-a', [
      { academicEnrollmentId: 'enrollment-a', status: 'present' },
    ]));
    expect(await screen.findByText('Change history')).toBeTruthy();
  });

  it('shows status history and keeps a read-only school from exposing mutation controls', async () => {
    attendanceApi.listAttendanceSchools.mockResolvedValue([{ ...school, canRecordAttendance: false }]);
    attendanceApi.readAttendanceRegister.mockResolvedValue({ ...register, register: { id: 'register-a' }, entries: [{ ...student, status: 'absent' }], completion: { ...register.completion, absent: 1, unmarked: 0, complete: true } });
    attendanceApi.listAttendanceEvents.mockResolvedValue([{ previousStatus: 'present', status: 'absent', createdAt: '2026-09-28T17:00:00.000Z', requestId: 'request-a' }]);
    render(<AttendanceClient />);
    expect(await screen.findByText('Read-only register')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save attendance' })).toBeNull();
    expect(await screen.findByText('Corrected')).toBeTruthy();
    expect(attendanceApi.saveAttendanceRegister).not.toHaveBeenCalled();
  });

  it('surfaces API errors with readable in-page feedback', async () => {
    attendanceApi.readAttendanceRegister.mockRejectedValue(new Error('The student roster changed. Refresh the register and try again'));
    render(<AttendanceClient />);
    expect(await screen.findByText('The student roster changed. Refresh the register and try again')).toBeTruthy();
    expect(screen.getByText('Could not complete the request')).toBeTruthy();
  });
});
