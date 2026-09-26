import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createAccountWithMembership, seedTenantAuthorization, withTenantContext } from '@classloom/db';
import postgres from 'postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { AUTH_CONFIG } from '../auth/auth.constants.js';
import { PasswordService } from '../auth/password.service.js';
import { parseEnv } from '../config/env.js';
import { DatabaseService } from '../database/database.service.js';
import type { StudentCsvMapping } from './student-import.js';

const enabled = Boolean(process.env.DATABASE_URL && process.env.DATABASE_MIGRATION_URL);
const headers = { Origin: 'http://localhost:3000', 'X-ClassLoom-Request': '1' };
const mapping: StudentCsvMapping = {
  studentCode: 'Student Code', studentGivenName: 'First Name', studentFamilyName: 'Last Name', dateOfBirth: 'DOB',
  admissionNumber: 'Admission', sessionCode: 'Session', classCode: 'Class', sectionCode: 'Section',
  guardianCode: 'Guardian Code', guardianGivenName: 'Guardian First', guardianFamilyName: 'Guardian Last', relationshipType: 'Relationship',
};
const csvHeader = 'Student Code,First Name,Last Name,DOB,Admission,Session,Class,Section,Guardian Code,Guardian First,Guardian Last,Relationship';

describe.skipIf(!enabled)('student CSV import API', () => {
  let app: INestApplication;
  let admin: ReturnType<typeof postgres>;
  const tenantId = randomUUID();
  const schoolId = randomUUID();
  const email = `import-admin-${randomUUID()}@example.test`;
  const password = 'a secure long passphrase';
  let cookie: string;
  const base = `/api/v1/enrollment/schools/${schoolId}/imports/students`;

  beforeAll(async () => {
    admin = postgres(process.env.DATABASE_MIGRATION_URL!, { max: 1 });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_CONFIG).useValue(parseEnv({ DATABASE_URL: process.env.DATABASE_URL!, AUTH_LOGIN_LIMIT: '100' })).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    await admin`insert into tenants (id, name, slug) values (${tenantId}, 'Import API', ${`import-api-${tenantId}`})`;
    await admin`insert into schools (id, tenant_id, name, code, timezone, currency) values (${schoolId}, ${tenantId}, 'Import School', 'IMP', 'UTC', 'USD')`;
    const db = app.get(DatabaseService).db;
    await withTenantContext(db, tenantId, (tx) => seedTenantAuthorization(tx, tenantId));
    const hash = await app.get(PasswordService).hash(password);
    const account = await createAccountWithMembership(db, { email, passwordHash: hash, tenantId });
    const [role] = await admin<{ id: string }[]>`select id from authorization_roles where tenant_id = ${tenantId} and system_key = 'tenant_admin'`;
    await admin`insert into membership_role_assignments (tenant_id, membership_id, role_id, scope_kind) values (${tenantId}, ${account.membershipId}, ${role!.id}, 'tenant')`;
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').set(headers).send({ email, password });
    cookie = (login.headers['set-cookie'] as unknown as string[])[0]!.split(';', 1)[0]!;
    const session = await request(app.getHttpServer()).post(`/api/v1/academics/schools/${schoolId}/sessions`).set({ ...headers, Cookie: cookie })
      .send({ name: '2026–27', code: '2026', startDate: '2026-04-01', endDate: '2027-03-31' });
    const klass = await request(app.getHttpServer()).post(`/api/v1/academics/schools/${schoolId}/sessions/${session.body.id}/classes`).set({ ...headers, Cookie: cookie })
      .send({ name: 'Grade 8', code: 'G8' });
    await request(app.getHttpServer()).post(`/api/v1/academics/schools/${schoolId}/classes/${klass.body.id}/sections`).set({ ...headers, Cookie: cookie })
      .send({ name: 'Section A', code: 'A' }).expect(201);
  });

  afterAll(async () => {
    if (admin) {
      await admin`delete from student_academic_enrollments where tenant_id = ${tenantId}`;
      await admin`delete from student_school_enrollments where tenant_id = ${tenantId}`;
      await admin`delete from student_guardian_relationships where tenant_id = ${tenantId}`;
      await admin`delete from student_import_batches where tenant_id = ${tenantId}`;
      await admin`delete from guardian_profiles where tenant_id = ${tenantId}`;
      await admin`delete from student_profiles where tenant_id = ${tenantId}`;
      await admin`delete from tenants where id = ${tenantId}`;
      await admin`delete from accounts where normalized_email = ${email}`;
      await admin.end();
    }
    await app?.close();
  });

  const upload = (path: string, csv: string, key?: string) => {
    const operation = request(app.getHttpServer()).post(`${base}/${path}`).set({ ...headers, Cookie: cookie, ...(key ? { 'Idempotency-Key': key } : {}) })
      .field('mapping', JSON.stringify(mapping)).attach('file', Buffer.from(csv), { filename: 'students.csv', contentType: 'text/csv' });
    return operation;
  };

  it('inspects and previews without writing records', async () => {
    const csv = `${csvHeader}\nIMP-1,Asha,Rao,2013-08-14,ADM-IMP-1,2026,G8,A,G-IMP-1,Ravi,Rao,Father`;
    expect((await request(app.getHttpServer()).post(`${base}/inspect`).attach('file', Buffer.from(csv), 'students.csv')).status).toBe(401);
    const inspected = await upload('inspect', csv);
    expect(inspected.status).toBe(201);
    expect(inspected.body.headers).toContain('Student Code');
    const preview = await upload('preview', csv);
    expect(preview.status).toBe(201);
    expect(preview.body).toMatchObject({ rowCount: 1, errors: [] });
    const [students] = await admin<{ count: number }[]>`select count(*)::int as count from student_profiles where tenant_id = ${tenantId}`;
    expect(students!.count).toBe(0);
  });

  it('commits atomically and replays the same idempotency key', async () => {
    const csv = `${csvHeader}\nIMP-1,Asha,Rao,2013-08-14,ADM-IMP-1,2026,G8,A,G-IMP-1,Ravi,Rao,Father`;
    const key = randomUUID();
    const first = await upload('commit', csv, key);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ replayed: false, studentCount: 1, guardianCount: 1, enrollmentCount: 1 });
    const second = await upload('commit', csv, key);
    expect(second.body).toMatchObject({ replayed: true, batchId: first.body.batchId });
    const changed = await upload('commit', csv.replace('Asha', 'Mira'), key);
    expect(changed.status).toBe(409);
    const conflictingPreview = await upload('preview', csv.replace('Asha', 'Mira'));
    expect(conflictingPreview.status).toBe(201);
    expect(conflictingPreview.body.errors).toEqual([expect.objectContaining({ row: 2, field: 'studentGivenName' })]);
    const [students] = await admin<{ count: number }[]>`select count(*)::int as count from student_profiles where tenant_id = ${tenantId}`;
    expect(students!.count).toBe(1);
  });

  it('rejects a conflicting row without partial students or guardians', async () => {
    const csv = `${csvHeader}\nIMP-2,Kabir,Rao,2014-08-14,ADM-IMP-2,2026,G8,A,G-IMP-2,Nina,Rao,Mother\nIMP-1,Different,Rao,2013-08-14,ADM-IMP-3,2026,G8,A,,,,`;
    const result = await upload('commit', csv, randomUUID());
    expect(result.status).toBe(409);
    const [students] = await admin<{ count: number }[]>`select count(*)::int as count from student_profiles where tenant_id = ${tenantId} and student_code = 'IMP-2'`;
    const [guardians] = await admin<{ count: number }[]>`select count(*)::int as count from guardian_profiles where tenant_id = ${tenantId} and guardian_code = 'G-IMP-2'`;
    expect(students!.count).toBe(0);
    expect(guardians!.count).toBe(0);
  });
});
