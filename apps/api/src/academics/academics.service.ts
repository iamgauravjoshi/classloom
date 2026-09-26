import { Injectable, Optional } from '@nestjs/common';
import { resolveEnrollmentPlacement, type EnrollmentPlacementInput, type TenantTransaction } from '@classloom/db';

type AcademicScope = { tenantId: string; schoolId: string };

@Injectable()
export class AcademicsService {
  constructor(@Optional() private readonly resolver: typeof resolveEnrollmentPlacement = resolveEnrollmentPlacement) {}

  requireEnrollmentPlacement(tx: TenantTransaction, scope: AcademicScope, input: EnrollmentPlacementInput) {
    return this.resolver(tx, scope, input);
  }
}
