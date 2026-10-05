// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExaminationsClient } from './examinations-client';
const api = vi.hoisted(() => ({ listExamSchools: vi.fn(), getExamSetup: vi.fn(), readExamSheet: vi.fn(), saveExamMarks: vi.fn(), reviewExamSheet: vi.fn(), createExam: vi.fn(), addAssessment: vi.fn(), changeExamState: vi.fn(), requestCorrection: vi.fn(), decideCorrection: vi.fn() }));
vi.mock('@/lib/examinations-api', async (original) => ({ ...await original<typeof import('@/lib/examinations-api')>(), ...api }));
const capabilities = { canRead: true, canEnter: true, canManage: true, canApprove: true };
const exam = { id: 'exam', name: 'September exams', sessionId: 'session', classId: 'class', startDate: '2020-09-01', endDate: '2020-09-30', status: 'open', version: 2 };
const assessment = { id: 'assessment', examId: 'exam', label: 'English paper', assessmentDate: '2020-09-20', maximumScore: 10000, passingScore: 3500, status: 'draft', version: 0, sectionId: 'section' };
const sheet = { exam, assessment, marks: [{ id: 'mark', displayName: 'Asha Rao', rollNumber: '1', status: 'scored', score: 7250 }], corrections: [], events: [], capabilities, currentAccountId: 'account' };
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  api.listExamSchools.mockResolvedValue([{ id: 'school', name: 'North School', timezone: 'UTC', ...capabilities }]);
  api.getExamSetup.mockResolvedValue({ capabilities, exams: [exam], assessments: [assessment], academic: { sessions: [{ id: 'session', name: '2020', startDate: '2020-09-01', endDate: '2021-08-31' }], classes: [{ id: 'class', name: 'Grade 1', sessionId: 'session' }], sections: [{ id: 'section', name: 'Section A' }], subjects: [] } });
  api.readExamSheet.mockResolvedValue(sheet); api.saveExamMarks.mockResolvedValue({ ...sheet, assessment: { ...assessment, version: 1 } });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals(); });
async function openSheet() {
  const user = userEvent.setup(); render(<ExaminationsClient />);
  await screen.findByText('Create examination');
  await user.click(screen.getByRole('combobox', { name: 'Examination' }));
  await user.click(await screen.findByRole('option', { name: 'September exams · Open' }));
  await user.click(screen.getByRole('combobox', { name: 'Assessment sheet' }));
  await user.click(await screen.findByRole('option', { name: 'English paper · Section A · Draft' }));
  await screen.findAllByText('Asha Rao'); return user;
}
describe('examination workspace', () => {
  it('keeps draft edits after validation or server failure and submits exact zero marks', async () => {
    const user = await openSheet(); const input = screen.getAllByRole('textbox', { name: 'Marks for Asha Rao' })[0];
    await user.clear(input); await user.type(input, '101'); await user.click(screen.getByRole('button', { name: 'Save marks' }));
    expect(await screen.findByText('Marks cannot exceed 100')).toBeTruthy(); expect(api.saveExamMarks).not.toHaveBeenCalled();
    await user.clear(input); await user.type(input, '0'); api.saveExamMarks.mockRejectedValueOnce(new Error('This examination changed. Refresh before saving'));
    await user.click(screen.getByRole('button', { name: 'Save marks' }));
    expect(await screen.findByText('This examination changed. Refresh before saving')).toBeTruthy(); expect((input as HTMLInputElement).value).toBe('0');
    expect(api.saveExamMarks).toHaveBeenCalledWith('school', expect.objectContaining({ version: 0 }), [{ markId: 'mark', status: 'scored', score: 0 }]);
  });
  it('pauses writes after a successful save if refresh fails and recovers on retry', async () => {
    const user = await openSheet(); const input = screen.getAllByRole('textbox', { name: 'Marks for Asha Rao' })[0];
    await user.clear(input); await user.type(input, '70'); api.getExamSetup.mockRejectedValueOnce(new Error('Connection lost'));
    await user.click(screen.getByRole('button', { name: 'Save marks' }));
    expect(await screen.findByText('Refresh needed')).toBeTruthy(); expect((screen.getByRole('button', { name: 'Save marks' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Refresh' })); await waitFor(() => expect(screen.queryByText('Refresh needed')).toBeNull());
    expect(api.saveExamMarks).toHaveBeenCalledTimes(1);
  });
  it('uses a shadcn calendar and hides self-review actions on locked correction requests', async () => {
    api.readExamSheet.mockResolvedValue({ ...sheet, assessment: { ...assessment, status: 'locked' }, corrections: [{ id: 'correction', markId: 'mark', status: 'pending', previousStatus: 'scored', previousScore: 7250, proposedStatus: 'scored', proposedScore: 7500, reason: 'Rechecked', requestedByAccountId: 'account' }] });
    const user = await openSheet();
    expect(await screen.findByText('Another authorized account must review your correction.')).toBeTruthy(); expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Create examination' }));
    expect(screen.getByRole('button', { name: 'Start date' })).toBeTruthy(); expect(document.querySelector('input[type="date"]')).toBeNull();
    await user.click(screen.getByRole('combobox', { name: 'Academic session' }));
    await user.click(await screen.findByRole('option', { name: '2020' }));
    await user.click(screen.getByRole('button', { name: 'Start date' }));
    await user.click(await screen.findByRole('button', { name: 'Tuesday, September 1st, 2020' }));
    expect(screen.getByRole('dialog', { name: 'Create examination' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start date' }).textContent).toContain('September 1st, 2020');
  });
});
