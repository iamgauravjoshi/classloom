import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { AttendanceController } from './attendance.controller.js';

const request = {
  requestId: 'request-1',
  auth: { tenantId: 'tenant-1', accountId: 'account-1', activeMembershipId: 'membership-1' },
} as AuthenticatedRequest;

describe('AttendanceController', () => {
  it('delegates register reads using server-side tenant and session scope', async () => {
    const attendance = { readRegister: vi.fn().mockResolvedValue({ entries: [] }) };
    const controller = new AttendanceController(attendance as never);
    await expect(controller.readRegister(request, '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222', { date: '2026-09-28', sectionId: '33333333-3333-4333-8333-333333333333' }))
      .resolves.toEqual({ entries: [] });
    expect(attendance.readRegister).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-1' }), {
      tenantId: 'tenant-1', schoolId: '11111111-1111-4111-8111-111111111111',
    }, {
      sessionId: '22222222-2222-4222-8222-222222222222', date: '2026-09-28', sectionId: '33333333-3333-4333-8333-333333333333',
    });
  });

  it('rejects unknown query fields and duplicate student entries', async () => {
    const controller = new AttendanceController({ saveRegister: vi.fn() } as never);
    await expect(controller.saveRegister(request, '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222', { date: '2026-09-28', sectionId: '33333333-3333-4333-8333-333333333333', ignored: true }, { entries: [] }))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.saveRegister(request, '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222', { date: '2026-09-28', sectionId: '33333333-3333-4333-8333-333333333333' }, {
        entries: [
          { academicEnrollmentId: '44444444-4444-4444-8444-444444444444', status: 'present' },
          { academicEnrollmentId: '44444444-4444-4444-8444-444444444444', status: 'absent' },
        ],
      })).rejects.toBeInstanceOf(BadRequestException);
  });
});
