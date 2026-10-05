import { apiRequest } from './people-enrollment-request';

export type ExamCapabilities = { canRead: boolean; canManage: boolean; canEnter: boolean; canApprove: boolean };
export type ExamSchool = ExamCapabilities & { id: string; name: string; timezone: string };
export type Exam = { id: string; sessionId: string; classId: string; name: string; startDate: string; endDate: string; status: 'draft' | 'open' | 'completed'; version: number };
export type Assessment = { id: string; examId: string; sessionId: string; classId: string; sectionId: string; subjectId: string; label: string; assessmentDate: string; maximumScore: number; passingScore: number; status: 'draft' | 'submitted' | 'locked'; version: number };
export type MarkStatus = 'unmarked' | 'scored' | 'absent' | 'exempt';
export type ExamMark = { id: string; displayName: string; rollNumber: string | null; status: MarkStatus; score: number | null; revision: number };
export type ExamCorrection = { id: string; markId: string; previousStatus: MarkStatus; previousScore: number | null; proposedStatus: MarkStatus; proposedScore: number | null; reason: string; status: 'pending' | 'approved' | 'rejected'; requestedByAccountId: string; decisionReason: string | null; createdAt: string };
export type ExamEvent = { id: string; eventType: string; createdAt: string; details: { reason?: string | null } };
export type ExamSheetData = { exam: Exam; assessment: Assessment; marks: ExamMark[]; corrections: ExamCorrection[]; events: ExamEvent[] };
export type ExamSheet = ExamSheetData & { capabilities: ExamCapabilities; currentAccountId: string };
export type ExamSetup = { capabilities: ExamCapabilities; exams: Exam[]; assessments: Assessment[]; academic: {
  sessions: { id: string; name: string; startDate: string; endDate: string }[];
  classes: { id: string; sessionId: string; name: string }[];
  sections: { id: string; sessionId: string; classId: string; name: string }[];
  subjects: { id: string; sessionId: string; name: string }[];
} };

export function scoreToHundredths(text: string, maximum = 100000): number {
  const value = text.trim();
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(value)) throw new Error('Enter marks with at most two decimal places, such as 72.50');
  const [whole, fraction = ''] = value.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (result > maximum) throw new Error(`Marks cannot exceed ${formatScore(maximum)}`);
  return result;
}
export const formatScore = (score: number) => (score / 100).toFixed(2).replace(/\.00$/, '');
export const displayMark = (status: MarkStatus, score: number | null) => status === 'scored' && score !== null ? formatScore(score) : status;
const prefix = '/api/examinations';
const school = (id: string) => `${prefix}/schools/${id}`;
const sheet = (id: string, assessmentId: string) => `${school(id)}/assessments/${assessmentId}`;
export const listExamSchools = () => apiRequest<ExamSchool[]>(`${prefix}/schools`);
export const getExamSetup = (id: string) => apiRequest<ExamSetup>(`${school(id)}/setup`);
export const readExamSheet = (id: string, assessmentId: string) => apiRequest<ExamSheet>(`${sheet(id, assessmentId)}/sheet`);
export const createExam = (id: string, input: { sessionId: string; classId: string; name: string; startDate: string; endDate: string }) => apiRequest<Exam>(`${school(id)}/exams`, 'POST', input);
export const addAssessment = (id: string, examId: string, input: { expectedVersion: number; sectionId: string; subjectId: string; label: string; assessmentDate: string; maximumScore: number; passingScore: number }) => apiRequest<Assessment>(`${school(id)}/exams/${examId}/assessments`, 'POST', input);
export const changeExamState = (id: string, exam: Exam, action: 'open' | 'complete') => apiRequest<Exam>(`${school(id)}/exams/${exam.id}/lifecycle`, 'POST', { expectedVersion: exam.version, action });
export const saveExamMarks = (id: string, assessment: Assessment, entries: { markId: string; status: MarkStatus; score: number | null }[]) => apiRequest<ExamSheetData>(`${sheet(id, assessment.id)}/marks`, 'PUT', { expectedVersion: assessment.version, entries });
export const reviewExamSheet = (id: string, assessment: Assessment, action: 'submit' | 'return' | 'lock', reason?: string) => apiRequest<ExamSheetData>(`${sheet(id, assessment.id)}/review`, 'POST', { expectedVersion: assessment.version, action, reason });
export const requestCorrection = (id: string, assessment: Assessment, input: { markId: string; status: MarkStatus; score: number | null; reason: string }) => apiRequest<ExamSheetData>(`${sheet(id, assessment.id)}/corrections`, 'POST', { expectedVersion: assessment.version, ...input });
export const decideCorrection = (id: string, assessment: Assessment, correctionId: string, decision: 'approve' | 'reject', reason: string) => apiRequest<ExamSheetData>(`${sheet(id, assessment.id)}/decisions`, 'POST', { expectedVersion: assessment.version, correctionId, decision, reason });
