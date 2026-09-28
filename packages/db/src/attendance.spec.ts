import { describe, expect, it } from 'vitest';
import {
  AttendanceError,
  calculateAttendanceCompletion,
  changedAttendanceEntries,
  normalizeAttendanceRegisterInput,
} from './attendance.js';

const roster = [
  { academicEnrollmentId: 'enrollment-1', studentId: 'student-1', rollNumber: '1', displayName: 'Asha Rao' },
  { academicEnrollmentId: 'enrollment-2', studentId: 'student-2', rollNumber: '2', displayName: 'Nikhil Rao' },
  { academicEnrollmentId: 'enrollment-3', studentId: 'student-3', rollNumber: null, displayName: 'Mira Rao' },
];

describe('daily attendance normalization', () => {
  it('returns explicit statuses in authoritative roster order', () => {
    expect(normalizeAttendanceRegisterInput({
      sessionId: 'session-1', sectionId: 'section-1', date: '2026-09-28',
      entries: [
        { academicEnrollmentId: 'enrollment-3', status: 'late' },
        { academicEnrollmentId: 'enrollment-1', status: 'present' },
        { academicEnrollmentId: 'enrollment-2', status: 'excused' },
      ],
    }, roster)).toEqual({
      sessionId: 'session-1', sectionId: 'section-1', date: '2026-09-28',
      entries: [
        { academicEnrollmentId: 'enrollment-1', status: 'present' },
        { academicEnrollmentId: 'enrollment-2', status: 'excused' },
        { academicEnrollmentId: 'enrollment-3', status: 'late' },
      ],
    });
  });

  it('rejects an incomplete roster without defaulting missing students to absent', () => {
    expect(() => normalizeAttendanceRegisterInput({
      sessionId: 'session-1', sectionId: 'section-1', date: '2026-09-28',
      entries: [{ academicEnrollmentId: 'enrollment-1', status: 'present' }],
    }, roster)).toThrowError(new AttendanceError('INVALID', 'Set an attendance status for every enrolled student'));
  });

  it('rejects duplicate and out-of-roster enrollments', () => {
    const duplicate = [
      { academicEnrollmentId: 'enrollment-1', status: 'present' as const },
      { academicEnrollmentId: 'enrollment-1', status: 'absent' as const },
      { academicEnrollmentId: 'enrollment-2', status: 'present' as const },
      { academicEnrollmentId: 'enrollment-3', status: 'present' as const },
    ];
    expect(() => normalizeAttendanceRegisterInput({ sessionId: 'session-1', sectionId: 'section-1', date: '2026-09-28', entries: duplicate }, roster))
      .toThrowError(new AttendanceError('INVALID', 'An enrollment may appear only once in an attendance register'));
    const foreign = roster.map((student) => ({ academicEnrollmentId: student.academicEnrollmentId, status: 'present' as const }));
    foreign[2] = { academicEnrollmentId: 'other-school-enrollment', status: 'present' };
    expect(() => normalizeAttendanceRegisterInput({ sessionId: 'session-1', sectionId: 'section-1', date: '2026-09-28', entries: foreign }, roster))
      .toThrowError(new AttendanceError('CONFLICT', 'The student roster changed. Refresh the register and try again'));
  });

  it('rejects unsupported statuses and malformed calendar dates', () => {
    const statuses = roster.map((student) => ({ academicEnrollmentId: student.academicEnrollmentId, status: 'tardy' as 'present' }));
    expect(() => normalizeAttendanceRegisterInput({ sessionId: 'session-1', sectionId: 'section-1', date: '2026-09-28', entries: statuses }, roster))
      .toThrowError(new AttendanceError('INVALID', 'Choose present, absent, late, or excused for every student'));
    const valid = roster.map((student) => ({ academicEnrollmentId: student.academicEnrollmentId, status: 'present' as const }));
    expect(() => normalizeAttendanceRegisterInput({ sessionId: 'session-1', sectionId: 'section-1', date: '2026-02-30', entries: valid }, roster))
      .toThrowError(new AttendanceError('INVALID', 'Attendance date must be a valid calendar date'));
  });
});

describe('daily attendance completion and audit changes', () => {
  it('counts saved statuses and keeps a register incomplete until each roster member is marked', () => {
    expect(calculateAttendanceCompletion([
      { status: 'present' }, { status: 'absent' }, { status: null },
    ])).toEqual({ total: 3, present: 1, absent: 1, late: 0, excused: 0, unmarked: 1, complete: false });
    expect(calculateAttendanceCompletion([
      { status: 'present' }, { status: 'late' }, { status: 'excused' },
    ])).toEqual({ total: 3, present: 1, absent: 0, late: 1, excused: 1, unmarked: 0, complete: true });
  });

  it('returns only changed statuses for immutable correction history', () => {
    expect(changedAttendanceEntries(
      [
        { academicEnrollmentId: 'enrollment-1', status: 'present' },
        { academicEnrollmentId: 'enrollment-2', status: 'absent' },
      ],
      [
        { academicEnrollmentId: 'enrollment-1', status: 'present' },
        { academicEnrollmentId: 'enrollment-2', status: 'late' },
      ],
    )).toEqual([{ academicEnrollmentId: 'enrollment-2', previousStatus: 'absent', status: 'late' }]);
  });
});
