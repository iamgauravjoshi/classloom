import { apiRequest, queryString } from './people-enrollment-request';

const prefix = '/api/timetable';

export type TimetableSchool = {
  id: string;
  name: string;
  code: string;
  canReadTimetable: boolean;
  canManageTimetable: boolean;
};
export type TimetableStatus = 'draft' | 'published';
export type TimetableSlot = {
  id: string;
  sessionId: string;
  sectionId: string;
  subjectId: string;
  teacherAssignmentId: string | null;
  teacherMembershipId: string | null;
  weekday: number;
  startTime: string;
  endTime: string;
  roomLabel: string | null;
};
export type TimetableData = {
  timetable: { id: string; status: TimetableStatus } | null;
  slots: TimetableSlot[];
  options: {
    sections: { id: string; className: string; classCode: string; name: string; code: string; label: string }[];
    subjects: { id: string; name: string; code: string }[];
    teacherAssignments: { id: string; sectionId: string; subjectId: string; membershipId: string; displayName: string }[];
  };
};
export type TimetableFilters = { sectionId?: string; teacherMembershipId?: string };
export type TimetableSlotInput = {
  sessionId: string;
  sectionId: string;
  subjectId: string;
  teacherAssignmentId: string | null;
  weekday: number;
  startTime: string;
  endTime: string;
  roomLabel: string | null;
};

export const listTimetableSchools = () => apiRequest<TimetableSchool[]>(`${prefix}/schools`);
export const readTimetable = (schoolId: string, sessionId: string, filters: TimetableFilters = {}) =>
  apiRequest<TimetableData>(`${prefix}/schools/${schoolId}/sessions/${sessionId}${queryString(filters)}`);
export const createTimetableSlot = (schoolId: string, sessionId: string, input: TimetableSlotInput) =>
  apiRequest<TimetableSlot>(`${prefix}/schools/${schoolId}/sessions/${sessionId}/slots`, 'POST', input);
export const updateTimetableSlot = (schoolId: string, slotId: string, input: TimetableSlotInput) =>
  apiRequest<TimetableSlot>(`${prefix}/schools/${schoolId}/slots/${slotId}`, 'PATCH', input);
export const deleteTimetableSlot = (schoolId: string, slotId: string) =>
  apiRequest<{ deleted: boolean }>(`${prefix}/schools/${schoolId}/slots/${slotId}`, 'DELETE');
export const publishTimetable = (schoolId: string, sessionId: string) =>
  apiRequest<{ id: string; status: TimetableStatus }>(`${prefix}/schools/${schoolId}/sessions/${sessionId}/publish`, 'POST', {});
