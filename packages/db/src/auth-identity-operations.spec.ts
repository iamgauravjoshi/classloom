import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { createDb } from './client.js';
import { createAccountWithMembership, createPasswordResetToken, consumePasswordResetToken, consumeAuthRateLimit, createSession, createSessionIfPasswordHashUnchanged, getSessionByTokenHash } from './identity-repository.js';

const runtimeUrl = process.env.DATABASE_URL;
const migrationUrl = process.env.DATABASE_MIGRATION_URL;
const enabled = Boolean(runtimeUrl && migrationUrl);
describe('auth identity persistence', () => {
  it.skipIf(!enabled)('consumes a reset token once and revokes every session', async () => {
    const tenantId = randomUUID();
    const email = `reset-${tenantId}@example.test`;
    const tokenHash = `reset-${tenantId}`;
    tenants.push(tenantId); emails.push(email);
    await admin!`insert into tenants (id,name,slug) values (${tenantId},'Reset School',${`reset-${tenantId}`})`;
    const created = await createAccountWithMembership(runtime!.db, { email, passwordHash:'old-hash', tenantId });
    const now = new Date();
    await createSession(runtime!.db,{accountId:created.id,tokenHash:`session-${tenantId}`,idleExpiresAt:new Date(now.getTime()+60_000),absoluteExpiresAt:new Date(now.getTime()+120_000)});
    await createPasswordResetToken(runtime!.db, { accountId: created.id, tokenHash, expiresAt: new Date(Date.now()+60_000) });
    expect(await consumePasswordResetToken(runtime!.db,{tokenHash,passwordHash:'new-hash'})).toBe(true);
    expect(await consumePasswordResetToken(runtime!.db,{tokenHash,passwordHash:'replay-hash'})).toBe(false);
    const session=await getSessionByTokenHash(runtime!.db,`session-${tenantId}`);
    expect(session?.revokedAt).toBeInstanceOf(Date);
    const staleSession = await createSessionIfPasswordHashUnchanged(runtime!.db,{
      accountId:created.id,tokenHash:`stale-session-${tenantId}`,passwordHash:'old-hash',
      idleExpiresAt:new Date(now.getTime()+60_000),absoluteExpiresAt:new Date(now.getTime()+120_000),
    });
    expect(staleSession).toBeUndefined();
  });
  it.skipIf(!enabled)('shares attempts in PostgreSQL and blocks after the configured count', async () => {
    const subjectDigest = `subject-${randomUUID()}`;
    const at = new Date();
    const first = await consumeAuthRateLimit(runtime!.db,{scope:'test',subjectDigest,limit:2,windowSeconds:60,now:at});
    const second = await consumeAuthRateLimit(runtimeReplica!.db,{scope:'test',subjectDigest,limit:2,windowSeconds:60,now:at});
    const third = await consumeAuthRateLimit(runtime!.db,{scope:'test',subjectDigest,limit:2,windowSeconds:60,now:at});
    expect([first.allowed,second.allowed,third.allowed]).toEqual([true,true,false]);
  });
  it.skipIf(!enabled)('rejects expired password reset tokens', async () => {
    const tenantId=randomUUID(); const email=`expired-reset-${tenantId}@example.test`; const tokenHash=`expired-reset:${tenantId}`;
    tenants.push(tenantId); emails.push(email);
    await admin!`insert into tenants (id,name,slug) values (${tenantId},'Expired Reset',${`expired-reset-${tenantId}`})`;
    const account=await createAccountWithMembership(runtime!.db,{email,passwordHash:'old',tenantId});
    await createPasswordResetToken(runtime!.db,{accountId:account.id,tokenHash,expiresAt:new Date(Date.now()-1000)});
    expect(await consumePasswordResetToken(runtime!.db,{tokenHash,passwordHash:'new'})).toBe(false);
  });
});
let admin: ReturnType<typeof postgres> | undefined;
let runtime: ReturnType<typeof createDb> | undefined;
let runtimeReplica: ReturnType<typeof createDb> | undefined;
const tenants:string[]=[]; const emails:string[]=[];
beforeAll(()=>{ if(enabled){admin=postgres(migrationUrl!,{max:1});runtime=createDb(runtimeUrl!,{maxConnections:4});runtimeReplica=createDb(runtimeUrl!,{maxConnections:2});} });
afterAll(async()=>{ if(admin&&emails.length) await admin`delete from accounts where normalized_email=any(${admin.array(emails)})`; if(admin&&tenants.length) await admin`delete from tenants where id::text=any(${admin.array(tenants)})`; await admin?.end(); await runtime?.close(); await runtimeReplica?.close(); });
