// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdmissionCaseClient } from './admission-case-client';

const api = vi.hoisted(() => ({ listAdmissionSchools: vi.fn(), getAdmissionCase: vi.fn(), listAdmissionCaseEvents: vi.fn(), reviewAdmissionCase: vi.fn() }));
const academics = vi.hoisted(() => ({ getAcademicSetup: vi.fn() }));
vi.mock('@/lib/admissions-api', () => ({ ...api, transitionAdmissionCase: vi.fn(), updateAdmissionCase: vi.fn(), decideAdmissionCase: vi.fn(), withdrawAdmissionCase: vi.fn(), admitAdmissionCase: vi.fn(), reviewAdmissionCase: api.reviewAdmissionCase }));
vi.mock('@/lib/academics-api', () => academics);

const record = { id: 'case-a', caseReference: 'ADM-ABC123', schoolId: 'school-a', status: 'submitted', studentGivenName: 'Asha', studentFamilyName: 'Shah', studentPreferredName: null, studentDateOfBirth: '2014-01-01', studentEmail: null, studentPhone: null, studentMiddleName: null, studentGender: null, existingStudentId: null, requestedSessionId: null, requestedClassId: null, requestedSectionId: null, reviewNote: null, decisionNote: null, convertedStudentId: null, convertedSchoolEnrollmentId: null, convertedAcademicEnrollmentId: null, createdAt: '2026-09-27T08:00:00.000Z', updatedAt: '2026-09-27T08:00:00.000Z', guardians: [] };
const school = { id: 'school-a', name: 'North School', code: 'NORTH', canReadAdmissions: true, canManageAdmissions: true, canConvertAdmissions: true };
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  api.listAdmissionSchools.mockResolvedValue([school]); api.getAdmissionCase.mockResolvedValue(record); api.listAdmissionCaseEvents.mockResolvedValue([]);
  api.reviewAdmissionCase.mockResolvedValue({ ...record, status: 'under_review' }); academics.getAcademicSetup.mockResolvedValue({ sessions: [], classes: [], sections: [] });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('admission case detail', () => {
  it('starts a review from the submitted state', async () => {
    const user = userEvent.setup(); render(<AdmissionCaseClient caseId="case-a" />);
    expect(await screen.findByRole('heading', { name: 'Asha Shah' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Start review' }));
    expect(api.reviewAdmissionCase).toHaveBeenCalledWith('school-a', 'case-a', 'start_review');
  });

  it('opens a separate admission confirmation for an accepted case', async () => {
    const user = userEvent.setup(); api.getAdmissionCase.mockResolvedValue({ ...record, status: 'accepted' }); render(<AdmissionCaseClient caseId="case-a" />);
    await user.click(await screen.findByRole('button', { name: 'Admit student' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/creates the student record, guardian relationships/i)).toBeTruthy();
  });

  it('shows saved case history and a useful message when a review action is stale', async () => {
    api.listAdmissionCaseEvents.mockResolvedValue([{ id: 'event-a', eventType: 'submit', fromStatus: 'draft', toStatus: 'submitted', createdAt: '2026-09-27T08:00:00.000Z', actorAccountId: 'account-a', actorMembershipId: 'membership-a' }]);
    api.reviewAdmissionCase.mockRejectedValue(new Error('This case changed. Reload and review the latest status.'));
    const user = userEvent.setup(); render(<AdmissionCaseClient caseId="case-a" />);
    expect(await screen.findByText((_, node) => node?.textContent?.replace(/\s+/g, ' ').trim() === 'Submit · draft → submitted')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Start review' }));
    expect(await screen.findByText('This case changed. Reload and review the latest status.')).toBeTruthy();
  });
});
