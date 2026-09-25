import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from '@classloom/db';
import { REQUIRED_PERMISSIONS_METADATA } from './authorization.constants.js';

export const RequirePermissions = (...keys: PermissionKey[]) => SetMetadata(REQUIRED_PERMISSIONS_METADATA, keys);
