import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExaminationsService } from './examinations.service.js';

const persistence = vi.hoisted(() => ({ getAttendanceSchool: vi.fn(), getAssessment: vi.fn(), readExamSheet: vi.fn(), saveExamMarks: vi.fn(), listExams: vi.fn(), listAssessments: vi.fn() }));
vi.mock('@classloom/db', async (original) => ({ ...await original<typeof import('@classloom/db')>(), ...persistence,
  withTenantContext: async (_db: unknown, _tenantId: string, callback: (tx: object) => unknown) => callback({}),
}));
const actor = { tenantId: 'tenant', accountId: 'account', membershipId: 'member', requestId: 'request' };
const assessment = { id: 'assessment', examId: 'exam', sessionId: 'session', sectionId: 'section', subjectId: 'subject', assessmentDate: '2020-01-01' };
function fixture(options: { permissions?: string[]; linked?: boolean; eligible?: boolean; subjectId?: string } = {}) {
  const permissions = options.permissions ?? ['marks.read', 'marks.enter'];
  const authorization = { hasPermissions: vi.fn(async (_actor, keys: string[]) => keys.every((k) => permissions.includes(k))) };
  const academics = { listExaminationOptions: vi.fn().mockResolvedValue({ sessions: [], classes: [], sections: [], subjects: [], assignments: [{ membershipId: 'member', sessionId: 'session', sectionId: 'section', subjectId: options.subjectId ?? 'subject' }] }) };
  const people = { getAttendanceTeacherLink: vi.fn().mockResolvedValue({ linked: options.linked ?? true, eligible: options.eligible ?? true }) };
  return new ExaminationsService({ db: {} } as never, authorization as never, academics as never, {} as never, people as never);
}
beforeEach(() => {
  vi.clearAllMocks();
  persistence.getAttendanceSchool.mockResolvedValue({ timezone: 'UTC' });
  persistence.getAssessment.mockResolvedValue(assessment);
  persistence.readExamSheet.mockResolvedValue({ assessment, marks: [] });
  persistence.saveExamMarks.mockResolvedValue({});
  persistence.listExams.mockResolvedValue([{ id: 'exam' }]); persistence.listAssessments.mockResolvedValue([assessment]);
});
describe('examination authorization', () => {
  it('allows an eligible linked teacher for the exact section and subject', async () => {
    await fixture().save(actor, 'school', 'assessment', 0, []);
    expect(persistence.saveExamMarks).toHaveBeenCalled();
  });
  it('denies an unlinked, inactive, or differently assigned teacher before exposing marks', async () => {
    for (const options of [{ linked: false }, { eligible: false }, { subjectId: 'other-subject' }]) {
      await expect(fixture(options).sheet(actor, 'school', 'assessment')).rejects.toBeInstanceOf(ForbiddenException);
      await expect(fixture(options).save(actor, 'school', 'assessment', 0, [])).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(persistence.readExamSheet).not.toHaveBeenCalled(); expect(persistence.saveExamMarks).not.toHaveBeenCalled();
  });
  it('filters inaccessible assessment sheets from setup', async () => {
    expect(await fixture({ subjectId: 'other' }).setup(actor, 'school')).toMatchObject({ exams: [], assessments: [] });
  });
  it('allows school readers and reviewers to view but requires entry permission for writes', async () => {
    const reader = fixture({ linked: false, permissions: ['marks.read'] });
    await expect(reader.sheet(actor, 'school', 'assessment')).resolves.toMatchObject({ marks: [] });
    await expect(reader.save(actor, 'school', 'assessment', 0, [])).rejects.toBeInstanceOf(ForbiddenException);
    await expect(fixture({ linked: false, permissions: ['marks.approve'] }).sheet(actor, 'school', 'assessment')).resolves.toMatchObject({ marks: [] });
  });
  it('rejects entry before the school-local assessment date', async () => {
    persistence.getAssessment.mockResolvedValue({ ...assessment, assessmentDate: '2099-01-01' });
    await expect(fixture().save(actor, 'school', 'assessment', 0, [])).rejects.toMatchObject({ code: 'INVALID' });
    expect(persistence.saveExamMarks).not.toHaveBeenCalled();
  });
});
