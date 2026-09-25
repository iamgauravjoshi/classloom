import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import postgres from 'postgres';
import { createAccountWithMembership, createMembershipInvitation } from '@classloom/db';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../app.module.js';
import { DatabaseService } from '../database/database.service.js';
import { PasswordService } from './password.service.js';
import { AUTH_CONFIG } from './auth.constants.js';
import { EmailService } from './email.service.js';
import { parseEnv } from '../config/env.js';
import { TokenService } from './token.service.js';

const runtimeUrl = process.env.DATABASE_URL;
const adminUrl = process.env.DATABASE_MIGRATION_URL;
const integrationEnabled = Boolean(runtimeUrl && adminUrl);
const browserHeaders = { Origin: 'http://localhost:3000', 'X-ClassLoom-Request': '1' };
const password = 'a secure long passphrase';

describe('authentication API', () => {
  let app: INestApplication | undefined;
  let admin: ReturnType<typeof postgres> | undefined;
  let tenantA = '';
  let tenantB = '';
  let emailA = '';
  let emailB = '';
  let membershipA = '';
  let membershipB = '';
  const emailedTokens: string[] = [];

  beforeAll(async () => {
    if (!integrationEnabled) return;
    admin = postgres(adminUrl!, { max: 1 });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_CONFIG).useValue(parseEnv({ DATABASE_URL: runtimeUrl!, AUTH_LOGIN_LIMIT: '100', AUTH_RESET_LIMIT: '100', AUTH_INVITATION_LIMIT: '100', AUTH_RATE_LIMIT_KEY: randomUUID() }))
      .overrideProvider(EmailService).useValue({
        sendInvitation: async (_email: string, token: string) => { emailedTokens.push(token); },
        sendPasswordReset: async (_email: string, token: string) => { emailedTokens.push(token); },
      }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    const suffix = randomUUID();
    tenantA = randomUUID();
    tenantB = randomUUID();
    emailA = `auth-a-${suffix}@example.test`;
    emailB = `auth-b-${suffix}@example.test`;
    await admin!`
      insert into tenants (id, name, slug) values
        (${tenantA}, 'Auth workspace A', ${`auth-a-${suffix}`}),
        (${tenantB}, 'Auth workspace B', ${`auth-b-${suffix}`})
    `;

    const db = app.get(DatabaseService).db;
    const hash = await app.get(PasswordService).hash(password);
    const accountA = await createAccountWithMembership(db, {
      email: emailA, displayName: 'Auth User A', passwordHash: hash, tenantId: tenantA,
    });
    const accountB = await createAccountWithMembership(db, {
      email: emailB, displayName: 'Auth User B', passwordHash: hash, tenantId: tenantB,
    });
    membershipA = accountA.membershipId;
    membershipB = accountB.membershipId;
  });

  it.skipIf(!integrationEnabled)('logs in, reports the own workspace, and validates membership selection', async () => {
    const login = await request(app!.getHttpServer())
      .post('/api/v1/auth/login').set(browserHeaders).send({ email: emailA, password });

    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({
      account: { email: emailA },
      activeMembership: { id: membershipA, tenantId: tenantA },
      workspaceSelectionRequired: false,
    });
    const cookieHeader = login.headers['set-cookie'] as unknown as string[];
    expect(cookieHeader).toHaveLength(1);
    expect(cookieHeader[0]).toMatch(/HttpOnly/i);
    expect(cookieHeader[0]).toMatch(/SameSite=Lax/i);
    expect(cookieHeader[0]).toMatch(/Path=\//i);
    expect(cookieHeader[0]).not.toMatch(/Domain=/i);
    expect(cookieHeader[0]).not.toMatch(/Secure/i);
    const cookie = cookieHeader[0]!.split(';', 1)[0]!;

    const session = await request(app!.getHttpServer()).get('/api/v1/auth/session').set('Cookie', cookie);
    expect(session.status).toBe(200);
    expect(session.body).toMatchObject({
      account: { email: emailA },
      activeMembership: { id: membershipA },
      memberships: [{ id: membershipA, tenantId: tenantA }],
    });

    const choices = await request(app!.getHttpServer()).get('/api/v1/auth/memberships').set('Cookie', cookie);
    expect(choices.body).toHaveLength(1);
    expect(choices.body[0]).toMatchObject({ id: membershipA, tenantId: tenantA });

    const otherAccount = await request(app!.getHttpServer())
      .post('/api/v1/auth/membership').set({ ...browserHeaders, Cookie: cookie })
      .send({ membershipId: membershipB });
    expect(otherAccount.status).toBe(403);

    const ownAccount = await request(app!.getHttpServer())
      .post('/api/v1/auth/membership').set({ ...browserHeaders, Cookie: cookie })
      .send({ membershipId: membershipA });
    expect(ownAccount.status).toBe(200);
    expect(ownAccount.body).toMatchObject({ activeMembershipId: membershipA });
  });

  it.skipIf(!integrationEnabled)('returns an indistinguishable error for unknown email and wrong password', async () => {
    const unknown = await request(app!.getHttpServer()).post('/api/v1/auth/login')
      .set(browserHeaders).send({ email: 'missing@example.test', password });
    const wrong = await request(app!.getHttpServer()).post('/api/v1/auth/login')
      .set(browserHeaders).send({ email: emailA, password: 'incorrect long passphrase' });

    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body).toMatchObject({
      code: wrong.body.code,
      message: wrong.body.message,
      details: wrong.body.details,
    });
    expect(unknown.body.message).toBe(wrong.body.message);
  });

  it.skipIf(!integrationEnabled)('rejects missing sessions and untrusted state-changing origins', async () => {
    const unauthenticated = await request(app!.getHttpServer()).get('/api/v1/auth/session');
    expect(unauthenticated.status).toBe(401);

    const badOrigin = await request(app!.getHttpServer()).post('/api/v1/auth/login')
      .set({ Origin: 'https://attacker.example', 'X-ClassLoom-Request': '1' })
      .send({ email: emailA, password });
    expect(badOrigin.status).toBe(403);
  });

  it.skipIf(!integrationEnabled)('keeps reset requests generic and consumes reset links once while revoking sessions', async () => {
    const resetEmail = `reset-${randomUUID()}@example.test`;
    const resetAccount = await createAccountWithMembership(app!.get(DatabaseService).db, {
      email: resetEmail, passwordHash: await app!.get(PasswordService).hash(password), tenantId: tenantA,
    });
    const unknown = await request(app!.getHttpServer()).post('/api/v1/auth/password-reset/request')
      .set(browserHeaders).send({ email: 'not-here@example.test' });
    const known = await request(app!.getHttpServer()).post('/api/v1/auth/password-reset/request')
      .set(browserHeaders).send({ email: resetEmail });
    expect(unknown.status).toBe(200);
    expect(known.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
    await vi.waitFor(()=>expect(emailedTokens).toHaveLength(1));
    const rawToken = emailedTokens.pop()!;
    const confirmed = await request(app!.getHttpServer()).post('/api/v1/auth/password-reset/confirm')
      .set(browserHeaders).send({ token: rawToken, password: 'a different secure passphrase' });
    expect(confirmed.status).toBe(200);
    const replay = await request(app!.getHttpServer()).post('/api/v1/auth/password-reset/confirm')
      .set(browserHeaders).send({ token: rawToken, password: 'another different secure passphrase' });
    expect(replay.status).toBe(400);
    const oldPassword = await request(app!.getHttpServer()).post('/api/v1/auth/login')
      .set(browserHeaders).send({ email: resetEmail, password });
    expect(oldPassword.status).toBe(401);
    const newPassword = await request(app!.getHttpServer()).post('/api/v1/auth/login')
      .set(browserHeaders).send({ email: resetEmail, password: 'a different secure passphrase' });
    expect(newPassword.status).toBe(200);
    await admin!`delete from accounts where id = ${resetAccount.id}`;
  });

  it.skipIf(!integrationEnabled)('accepts a new account invitation exactly once', async () => {
    const invitationEmail = `invited-${randomUUID()}@example.test`;
    const token = new TokenService().createOpaqueToken();
    const created = await createMembershipInvitation(app!.get(DatabaseService).db, {
      tenantId: tenantA, email: invitationEmail, tokenHash: token.hash, expiresAt: new Date(Date.now()+60_000),
    });
    const accepted = await request(app!.getHttpServer()).post('/api/v1/auth/invitations/accept')
      .set(browserHeaders).send({ token: token.raw, password: 'a secure invitation password' });
    expect(accepted.status).toBe(200);
    expect(accepted.body).toEqual({ accepted: true });
    const replay = await request(app!.getHttpServer()).post('/api/v1/auth/invitations/accept')
      .set(browserHeaders).send({ token: token.raw, password: 'a different invitation password' });
    expect(replay.status).toBe(400);
    await admin!`delete from accounts where normalized_email = ${invitationEmail}`;
    expect(created.id).toBeTruthy();
  });

  it.skipIf(!integrationEnabled)('explains a short invitation password without consuming the invitation', async () => {
    const token = app!.get(TokenService).createOpaqueToken();
    const invitationEmail = `short-password-${randomUUID()}@example.test`;
    await createMembershipInvitation(app!.get(DatabaseService).db, {
      tenantId: tenantA, email: invitationEmail, tokenHash: token.hash, expiresAt: new Date(Date.now() + 60_000),
    });
    const response = await request(app!.getHttpServer()).post('/api/v1/auth/invitations/accept')
      .set(browserHeaders).send({ token: token.raw, password: 'too-short' });
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/at least 15 characters/i);
    expect(response.body.details.fields.password).toMatch(/at least 15 characters/i);
    const accepted = await request(app!.getHttpServer()).post('/api/v1/auth/invitations/accept')
      .set(browserHeaders).send({ token: token.raw, password: 'a secure invitation password' });
    expect(accepted.status).toBe(200);
    await admin!`delete from accounts where normalized_email = ${invitationEmail}`;
  });

  it.skipIf(!integrationEnabled)('lets an authenticated existing account accept and activate another workspace', async () => {
    const token = new TokenService().createOpaqueToken();
    await createMembershipInvitation(app!.get(DatabaseService).db, {
      tenantId: tenantA, email: emailB, tokenHash: token.hash, expiresAt: new Date(Date.now() + 60_000),
    });
    const login = await request(app!.getHttpServer()).post('/api/v1/auth/login')
      .set(browserHeaders).send({ email: emailB, password });
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0]!.split(';', 1)[0]!;
    const accepted = await request(app!.getHttpServer()).post('/api/v1/auth/invitations/accept-existing')
      .set({ ...browserHeaders, Cookie: cookie }).send({ token: token.raw });
    expect(accepted.status).toBe(200);
    const session = await request(app!.getHttpServer()).get('/api/v1/auth/session').set('Cookie', cookie);
    expect(session.body).toMatchObject({ activeMembership: { tenantId: tenantA } });
  });

  it.skipIf(!integrationEnabled)('immediately rejects a session after its membership is suspended', async () => {
    const login = await request(app!.getHttpServer()).post('/api/v1/auth/login')
      .set(browserHeaders).send({ email: emailA, password });
    const cookieHeader = login.headers['set-cookie'] as unknown as string[];
    const cookie = cookieHeader[0]!.split(';', 1)[0]!;

    await admin!`update memberships set status = 'suspended' where id = ${membershipA}`;
    const session = await request(app!.getHttpServer()).get('/api/v1/auth/session').set('Cookie', cookie);
    expect(session.status).toBe(401);
    await admin!`update memberships set status = 'active' where id = ${membershipA}`;
  });

  it.skipIf(!integrationEnabled)('revokes the current session at logout and clears the cookie', async () => {
    const login = await request(app!.getHttpServer()).post('/api/v1/auth/login')
      .set(browserHeaders).send({ email: emailA, password });
    const cookieHeader = login.headers['set-cookie'] as unknown as string[];
    const cookie = cookieHeader[0]!.split(';', 1)[0]!;

    const logout = await request(app!.getHttpServer()).post('/api/v1/auth/logout')
      .set({ ...browserHeaders, Cookie: cookie });
    expect(logout.status).toBe(200);
    expect(logout.headers['set-cookie'][0]).toMatch(/^classloom_session=;.*Expires=/i);
    const session = await request(app!.getHttpServer()).get('/api/v1/auth/session').set('Cookie', cookie);
    expect(session.status).toBe(401);
  });

  afterAll(async () => {
    if (admin) {
      if (emailA || emailB) await admin`delete from accounts where normalized_email in (${emailA}, ${emailB})`;
      if (tenantA || tenantB) await admin`delete from tenants where id in (${tenantA}, ${tenantB})`;
    }
    await app?.close();
    await admin?.end();
  });
});

