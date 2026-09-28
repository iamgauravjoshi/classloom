import { apiRequest, queryString } from './people-enrollment-request';

const prefix = '/api/attendance';

export type AttendanceSchool = {
  id: string;
  name: string;
  code: string;
  timezone: string;
  today: string;
  canReadAttendance: boolean;
  canRecordAttendance: boolean;
};
export type AttendanceSession = { id: string; name: string; code: string; startDate: string; endDate: string; status: string };
export type AttendanceSection = { id: string; classId: string; className: string; classCode: string; name: string; code: string; label: string };
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
export type AttendanceRosterEntry = {
  academicEnrollmentId: string;
  studentId: string;
  rollNumber: string | null;
  displayName: string;
  status: AttendanceStatus | null;
};
export type AttendanceRegister = {
  register: { id: string } | null;
  entries: AttendanceRosterEntry[];
  completion: { total: number; present: number; absent: number; late: number; excused: number; unmarked: number; complete: boolean };
};
export type AttendanceEvent = { previousStatus: AttendanceStatus | null; status: AttendanceStatus; createdAt: string; requestId: string };

export const listAttendanceSchools = () => apiRequest<AttendanceSchool[]>(`${prefix}/schools`);
export const listAttendanceSessions = (schoolId: string) => apiRequest<AttendanceSession[]>(`${prefix}/schools/${schoolId}/sessions`);
export const listAttendanceSections = (schoolId: string, sessionId: string) =>
  apiRequest<AttendanceSection[]>(`${prefix}/schools/${schoolId}/sessions/${sessionId}/sections`);
export const readAttendanceRegister = (schoolId: string, sessionId: string, date: string, sectionId: string) =>
  apiRequest<AttendanceRegister>(`${prefix}/schools/${schoolId}/sessions/${sessionId}/register${queryString({ date, sectionId })}`);
export const saveAttendanceRegister = (schoolId: string, sessionId: string, date: string, sectionId: string, entries: { academicEnrollmentId: string; status: AttendanceStatus }[]) =>
  apiRequest<AttendanceRegister>(`${prefix}/schools/${schoolId}/sessions/${sessionId}/register${queryString({ date, sectionId })}`, 'PUT', { entries });
export const listAttendanceEvents = (schoolId: string, registerId: string) =>
  apiRequest<AttendanceEvent[]>(`${prefix}/schools/${schoolId}/registers/${registerId}/events`);
