import type { Request } from 'express';
import type { AuthenticatedSession } from './auth.service.js';
import type { AuthorizationScope } from '@classloom/db';

export type AuthenticatedRequest = Request & {
  requestId?: string;
  auth?: AuthenticatedSession;
  /** Must be resolved by server-side resource loading before authorization runs. */
  authorizationTargetScope?: AuthorizationScope;
};
