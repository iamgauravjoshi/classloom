import { describe, expect, it, vi } from 'vitest';
import type { TenantTransaction } from '@classloom/db';
import { AcademicsService } from './academics.service.js';

describe('AcademicsService enrollment placement contract', () => {
  it('delegates placement validation inside the caller transaction', async () => {
    const resolver = vi.fn().mockResolvedValue({
      sessionId: 'session-1', sessionName: '2026–27', classId: 'class-1', className: 'Grade 8', sectionId: 'section-1', sectionName: 'A',
    });
    const service = new AcademicsService(resolver);
    const tx = {} as TenantTransaction;
    await expect(service.requireEnrollmentPlacement(tx, { tenantId: 'tenant-1', schoolId: 'school-1' }, {
      sessionId: 'session-1', classId: 'class-1', sectionId: 'section-1',
    })).resolves.toMatchObject({ sectionId: 'section-1' });
    expect(resolver).toHaveBeenCalledWith(tx, { tenantId: 'tenant-1', schoolId: 'school-1' }, {
      sessionId: 'session-1', classId: 'class-1', sectionId: 'section-1',
    });
  });
});
