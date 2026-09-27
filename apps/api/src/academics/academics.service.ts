import { Injectable, Optional } from '@nestjs/common';
import { resolveEnrollmentPlacement, resolveEnrollmentPlacementByCodes, type EnrollmentPlacementInput, type TenantTransaction } from '@classloom/db';

type AcademicScope = { tenantId: string; schoolId: string };

@Injectable()
export class AcademicsService {
  constructor(@Optional() private readonly resolver: typeof resolveEnrollmentPlacement = resolveEnrollmentPlacement) {}

  requireEnrollmentPlacement(tx: TenantTransaction, scope: AcademicScope, input: EnrollmentPlacementInput) {
    return this.resolver(tx, scope, input);
  }

  requireEnrollmentPlacementByCodes(tx: TenantTransaction, scope: AcademicScope, input: { sessionCode: string; classCode: string; sectionCode: string }) {
    return resolveEnrollmentPlacementByCodes(tx, scope, input);
  }
}
