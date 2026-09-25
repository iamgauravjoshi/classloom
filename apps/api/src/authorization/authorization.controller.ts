import {
  BadRequestException,
  Body,
  Controller,
  ConflictException,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AuthorizationRepositoryError,
  assignRole,
  createCustomRole,
  listTenantAuthorizationRoles,
  listTenantAuthorizationAssignments,
  PERMISSION_CATALOG,
  revokeRoleAssignment,
  withTenantContext,
} from '@classloom/db';
import type { AuthorizationScope } from '@classloom/db';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import { DatabaseService } from '../database/database.service.js';
import { AuthorizationGuard } from './authorization.guard.js';
import { RequirePermissions } from './require-permissions.decorator.js';
import { z } from 'zod';

const uuid = z.string().uuid();
const scopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('tenant') }).strict(),
  z.object({ kind: z.literal('school'), schoolId: uuid }).strict(),
  z.object({ kind: z.literal('campus'), schoolId: uuid, campusId: uuid }).strict(),
]);
const createRoleSchema = z.object({
  key: z.string().trim().min(2).max(80).regex(/^[a-z][a-z0-9_]*$/),
  name: z.string().trim().min(2).max(120),
  permissionKeys: z.array(z.string().min(1).max(120)).max(PERMISSION_CATALOG.length),
}).strict().refine(({ permissionKeys }) => new Set(permissionKeys).size === permissionKeys.length, {
  message: 'Permission keys must be unique',
});
const assignSchema = z.object({ membershipId: uuid, roleId: uuid, scope: scopeSchema }).strict();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new BadRequestException('Invalid request');
  return parsed.data;
}

function tenantContext(request: AuthenticatedRequest) {
  const auth = request.auth;
  if (!auth?.tenantId || !auth.accountId || !auth.activeMembershipId) throw new ForbiddenException('Permission denied');
  return { tenantId: auth.tenantId, actorAccountId: auth.accountId, actorMembershipId: auth.activeMembershipId };
}

function mapRepositoryError(error: unknown): never {
  if (error instanceof AuthorizationRepositoryError) {
    if (error.code === 'FORBIDDEN' || error.code === 'LAST_TENANT_ADMIN') throw new ForbiddenException(error.message);
    if (error.code === 'NOT_FOUND') throw new NotFoundException(error.message);
    if (error.code === 'CONFLICT') throw new ConflictException(error.message);
    throw new BadRequestException(error.message);
  }
  throw error;
}

@ApiTags('Authorization')
@Controller('authorization')
@UseGuards(AuthGuard, CsrfGuard, AuthorizationGuard)
export class AuthorizationController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get('permissions')
  @RequirePermissions('authorization.roles.read')
  listPermissions(@Req() request: AuthenticatedRequest, @Query() query: Record<string, unknown>) {
    if (Object.hasOwn(query, 'tenantId')) throw new BadRequestException('Tenant cannot be selected by the client');
    tenantContext(request);
    return PERMISSION_CATALOG;
  }

  @Get('roles')
  @RequirePermissions('authorization.roles.read')
  listRoles(@Req() request: AuthenticatedRequest, @Query() query: Record<string, unknown>) {
    if (Object.hasOwn(query, 'tenantId')) throw new BadRequestException('Tenant cannot be selected by the client');
    const { tenantId } = tenantContext(request);
    return listTenantAuthorizationRoles(this.database.db, tenantId);
  }

  @Post('roles')
  @RequirePermissions('authorization.roles.manage')
  async createRole(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const context = tenantContext(request);
    const input = parse(createRoleSchema, body);
    try {
      return await withTenantContext(this.database.db, context.tenantId, (tx) => createCustomRole(tx, {
        ...context, ...input, requestId: request.requestId,
      }));
    } catch (error) {
      return mapRepositoryError(error);
    }
  }

  @Post('assignments')
  @RequirePermissions('authorization.roles.manage')
  async assign(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const context = tenantContext(request);
    const input = parse(assignSchema, body);
    try {
      const assignment = await withTenantContext(this.database.db, context.tenantId, (tx) => assignRole(tx, {
        ...context,
        membershipId: input.membershipId,
        roleId: input.roleId,
        scope: input.scope as AuthorizationScope,
        requestId: request.requestId,
      }));
      return assignment ?? { alreadyAssigned: true };
    } catch (error) {
      return mapRepositoryError(error);
    }
  }

  @Get('assignments')
  @RequirePermissions('authorization.roles.read')
  listAssignments(@Req() request: AuthenticatedRequest, @Query() query: Record<string, unknown>) {
    if (Object.hasOwn(query, 'tenantId')) throw new BadRequestException('Tenant cannot be selected by the client');
    const { tenantId } = tenantContext(request);
    return listTenantAuthorizationAssignments(this.database.db, tenantId);
  }

  @Delete('assignments/:assignmentId')
  @RequirePermissions('authorization.roles.manage')
  async revoke(@Req() request: AuthenticatedRequest, @Param('assignmentId') assignmentId: string) {
    const context = tenantContext(request);
    if (!uuid.safeParse(assignmentId).success) throw new BadRequestException('Invalid assignment ID');
    try {
      return await withTenantContext(this.database.db, context.tenantId, (tx) => revokeRoleAssignment(tx, {
        tenantId: context.tenantId, assignmentId, actorAccountId: context.actorAccountId, requestId: request.requestId,
      }));
    } catch (error) {
      return mapRepositoryError(error);
    }
  }
}



