import type { Request } from 'express';
import type { AuthenticatedSession } from './auth.service.js';

export type AuthenticatedRequest = Request & {
  requestId?: string;
  auth?: AuthenticatedSession;
};
