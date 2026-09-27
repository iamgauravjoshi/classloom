// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AdmissionsClient } from './admissions-client';

const api = vi.hoisted(() => ({ listAdmissionSchools: vi.fn(), listAdmissionCases: vi.fn() }));
const academics = vi.hoisted(() => ({ getAcademicSetup: vi.fn() }));
vi.mock('@/lib/admissions-api', () => api);
vi.mock('@/lib/academics-api', () => academics);

const school = { id: 'school-a', name: 'North School', code: 'NORTH', canReadAdmissions: true, canManageAdmissions: true, canConvertAdmissions: true };
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  api.listAdmissionSchools.mockResolvedValue([school]);
  api.listAdmissionCases.mockResolvedValue({ items: [{ id: 'case-a', caseReference: 'ADM-ABC123', status: 'under_review', studentGivenName: 'Asha', studentPreferredName: null, studentFamilyName: 'Shah', requestedSessionId: null, createdAt: '2026-09-27T08:00:00.000Z' }], nextCursor: null });
  academics.getAcademicSetup.mockResolvedValue({ sessions: [], classes: [], sections: [] });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('admissions worklist', () => {
  it('shows the case, its stage, and a detail link after loading', async () => {
    render(<AdmissionsClient />);
    expect(await screen.findByText('ADM-ABC123')).toBeTruthy();
    expect(screen.getByText('Asha Shah')).toBeTruthy();
    expect(screen.getByText('under review')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open' }).getAttribute('href')).toBe('/admissions/case-a?school=school-a');
  });

  it('shows a useful state when the active membership has no school access', async () => {
    api.listAdmissionSchools.mockResolvedValue([]);
    render(<AdmissionsClient />);
    expect(await screen.findByText('No admissions access')).toBeTruthy();
  });

  it('shows an empty worklist when filters have no matches', async () => {
    api.listAdmissionCases.mockResolvedValue({ items: [], nextCursor: null });
    render(<AdmissionsClient />);
    expect(await screen.findByText('No admission cases found')).toBeTruthy();
  });
});
