import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAdmissionCase, listAdmissionCases, transitionAdmissionCase } from './admissions-api';

const schoolId = '00000000-0000-4000-8000-000000000001';
const caseId = '00000000-0000-4000-8000-000000000002';
afterEach(() => vi.unstubAllGlobals());

describe('admissions API helpers', () => {
  it('encodes bounded worklist filters', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    await listAdmissionCases(schoolId, { q: 'Asha Rao', status: 'under_review', requestedSessionId: 'session-1', limit: 50 });
    expect(fetcher.mock.calls[0]![0]).toContain('q=Asha+Rao');
    expect(fetcher.mock.calls[0]![0]).toContain('status=under_review');
  });

  it('sends same-origin mutation headers through the shared request helper', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: caseId, status: 'enquiry' }), { status: 201 }));
    vi.stubGlobal('fetch', fetcher);
    await createAdmissionCase(schoolId, { studentGivenName: 'Asha' });
    const [, init] = fetcher.mock.calls[0]!;
    expect(init.credentials).toBe('include');
    expect(init.headers['x-classloom-request']).toBe('1');
  });

  it('maps actions to explicit lifecycle endpoints', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: caseId, status: 'submitted' }), { status: 201 }));
    vi.stubGlobal('fetch', fetcher);
    await transitionAdmissionCase(schoolId, caseId, 'submit');
    expect(fetcher.mock.calls[0]![0]).toBe(`/api/admissions/schools/${schoolId}/cases/${caseId}/submit`);
  });
});
