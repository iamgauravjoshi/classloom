import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { AuthConfiguration } from './auth.service.js';
import { AuthService } from './auth.service.js';
import { AUTH_CONFIG } from './auth.constants.js';
import { AuthGuard } from './auth.guard.js';
import { CsrfGuard } from './csrf.guard.js';
import type { AuthenticatedRequest } from './auth.types.js';
import { readSessionCookie } from './session-cookie.js';
import { IdentityFlowService } from './identity-flow.service.js';
import { validatePassword } from './password.service.js';
import { parseRequest } from '../common/request-validation.js';

const passwordSchema = z.string().max(1024).superRefine((value, context) => {
  const result = validatePassword(value);
  if (!result.success) context.addIssue({ code: 'custom', message: result.message });
});
const loginPasswordSchema = z.string().min(1, 'Enter your password').max(1024).refine((value) => Array.from(value).length <= 256, 'Password is too long');
const loginSchema = z.object({ email: z.email('Enter a valid email address').max(254), password: loginPasswordSchema });
const membershipSchema = z.object({ membershipId: z.string().uuid() });
const tokenSchema = z.string().min(32, 'This link is incomplete or invalid').max(256, 'This link is invalid');
const invitationAcceptanceSchema = z.object({ token: tokenSchema, password: passwordSchema, displayName: z.string().trim().max(120).optional().transform((value) => value || undefined) });
const existingInvitationSchema = z.object({ token: tokenSchema });
const resetRequestSchema = z.object({ email: z.email('Enter a valid email address').max(254) });
const resetConfirmSchema = z.object({ token: tokenSchema, password: passwordSchema });

const parseBody = parseRequest;

function cookieOptions(config: AuthConfiguration) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.cookieSecure,
    path: '/',
    maxAge: config.sessionAbsoluteTtlSeconds * 1000,
  };
}

@Controller('auth')
@ApiTags('Authentication')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(IdentityFlowService) private readonly identityFlows: IdentityFlowService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfiguration,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  async login(@Req() request: AuthenticatedRequest, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const input = parseBody(loginSchema, body);
    const result = await this.authService.login(input.email, input.password, request.ip, request.requestId);
    response.cookie(this.config.cookieName, result.sessionToken, cookieOptions(this.config));
    const { sessionToken: _token, ...publicResult } = result;
    return publicResult;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const token = readSessionCookie(request.headers.cookie, this.config.cookieName);
    await this.authService.logout(token ?? undefined);
    const { maxAge: _maxAge, ...clearOptions } = cookieOptions(this.config);
    response.clearCookie(this.config.cookieName, clearOptions);
    return { loggedOut: true };
  }

  @Get('session')
  @UseGuards(AuthGuard)
  async session(@Req() request: AuthenticatedRequest) {
    const auth = request.auth!;
    const memberships = await this.authService.memberships(auth.accountId);
    const activeMembership = memberships.find((membership) => membership.id === auth.activeMembershipId) ?? null;
    return {
      account: { id: auth.accountId, email: auth.email, displayName: auth.displayName },
      activeMembership,
      memberships,
      workspaceSelectionRequired: memberships.length > 0 && !activeMembership,
    };
  }

  @Get('memberships')
  @UseGuards(AuthGuard)
  async memberships(@Req() request: AuthenticatedRequest) {
    return this.authService.memberships(request.auth!.accountId);
  }

  @Post('membership')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard, AuthGuard)
  async selectMembership(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const input = parseBody(membershipSchema, body);
    const auth = request.auth!;
    await this.authService.selectMembership(auth.accountId, auth.sessionId, input.membershipId);
    return { activeMembershipId: input.membershipId };
  }

  @Post('invitations/accept')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  acceptInvitation(@Req() request: Request, @Body() body: unknown) {
    const input = parseBody(invitationAcceptanceSchema, body);
    return this.identityFlows.acceptNewInvitation(input.token, input.password, input.displayName, request.ip);
  }

  @Post('invitations/accept-existing')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard, AuthGuard)
  acceptExistingInvitation(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const input = parseBody(existingInvitationSchema, body);
    const auth = request.auth!;
    return this.identityFlows.acceptExistingInvitation(input.token, auth.accountId, auth.sessionId, request.ip, request.requestId);
  }

  @Post('password-reset/request')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  requestPasswordReset(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const input = parseBody(resetRequestSchema, body);
    return this.identityFlows.requestPasswordReset(input.email, request.ip, request.requestId);
  }

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  confirmPasswordReset(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const input = parseBody(resetConfirmSchema, body);
    return this.identityFlows.confirmPasswordReset(input.token, input.password, request.requestId, request.ip);
  }
}
