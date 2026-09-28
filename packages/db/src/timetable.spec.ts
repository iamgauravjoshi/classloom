import { describe, expect, it } from 'vitest';
import { TimetableError, normalizeTimetableSlotInput } from './timetable.js';

describe('timetable slot normalization', () => {
  it('keeps an unassigned teacher and normalizes an optional room label', () => {
    expect(normalizeTimetableSlotInput({
      sessionId: 'session-1', sectionId: 'section-1', subjectId: 'subject-1', weekday: 1,
      startTime: '09:00', endTime: '09:40', roomLabel: '  Lab A  ',
    })).toMatchObject({ teacherAssignmentId: null, roomLabel: 'Lab A' });
  });

  it('rejects weekdays outside Monday through Sunday', () => {
    expect(() => normalizeTimetableSlotInput({
      sessionId: 'session-1', sectionId: 'section-1', subjectId: 'subject-1', weekday: 0,
      startTime: '09:00', endTime: '09:40',
    })).toThrowError(new TimetableError('INVALID', 'Choose a weekday from Monday through Sunday'));
  });

  it('rejects invalid times and requires the end to follow the start', () => {
    const base = { sessionId: 'session-1', sectionId: 'section-1', subjectId: 'subject-1', weekday: 1 };
    expect(() => normalizeTimetableSlotInput({ ...base, startTime: '9:00', endTime: '09:40' })).toThrow(/valid local time/);
    expect(() => normalizeTimetableSlotInput({ ...base, startTime: '09:40', endTime: '09:00' })).toThrow(/end time must be after the start time/);
  });
});
