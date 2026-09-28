import { and, asc, eq, sql } from 'drizzle-orm';
import type { TenantTransaction } from './client.js';
import { feeAssignments, feeCharges, feeHeads, feeLedgerEntries, feePayments, feePlanLines, feePlans, feeReceiptCounters, schools } from './schema.js';

export type FinanceScope = { tenantId: string; schoolId: string };
export type FinanceActor = { accountId: string; membershipId: string };
export type PaymentAllocation = { chargeId: string; amountMinor: string };

export class FinanceError extends Error {
  constructor(readonly code: 'INVALID' | 'NOT_FOUND' | 'CONFLICT', message: string) { super(message); }
}

export function minorUnits(value: string): bigint {
  if (!/^[1-9]\d{0,14}$/.test(value)) throw new FinanceError('INVALID', 'Enter a positive amount in minor currency units');
  return BigInt(value);
}

export function balanceFromEntries(entries: { kind: string; amountMinor: bigint }[]): bigint {
  return entries.reduce((balance, entry) => balance + (entry.kind === 'charge' || entry.kind === 'payment_reversal' ? entry.amountMinor : -entry.amountMinor), 0n);
}

export async function getFinanceSchool(tx: TenantTransaction, scope: FinanceScope) {
  const [school] = await tx.select({ id: schools.id, name: schools.name, currency: schools.currency, timezone: schools.timezone })
    .from(schools).where(and(eq(schools.tenantId, scope.tenantId), eq(schools.id, scope.schoolId))).limit(1);
  if (!school) throw new FinanceError('NOT_FOUND', 'School was not found');
  return school;
}

export async function listFinanceSchools(tx: TenantTransaction, tenantId: string) {
  return tx.select({ id: schools.id, name: schools.name, currency: schools.currency, timezone: schools.timezone })
    .from(schools).where(eq(schools.tenantId, tenantId)).orderBy(asc(schools.name));
}

export async function listFeeSetup(tx: TenantTransaction, scope: FinanceScope) {
  const predicate = and(eq(feeHeads.tenantId, scope.tenantId), eq(feeHeads.schoolId, scope.schoolId));
  const [heads, plans, lines] = await Promise.all([
    tx.select().from(feeHeads).where(predicate).orderBy(asc(feeHeads.name)),
    tx.select().from(feePlans).where(and(eq(feePlans.tenantId, scope.tenantId), eq(feePlans.schoolId, scope.schoolId))).orderBy(asc(feePlans.name)),
    tx.select().from(feePlanLines).where(and(eq(feePlanLines.tenantId, scope.tenantId), eq(feePlanLines.schoolId, scope.schoolId))).orderBy(asc(feePlanLines.dueDate)),
  ]);
  return { heads, plans, lines: lines.map((line) => ({ ...line, amountMinor: line.amountMinor.toString() })) };
}

export async function createFeeHead(tx: TenantTransaction, scope: FinanceScope, input: { code: string; name: string }) {
  const [record] = await tx.insert(feeHeads).values({ ...scope, code: input.code.trim(), name: input.name.trim() }).returning();
  return record;
}

export async function createFeePlan(tx: TenantTransaction, scope: FinanceScope, input: { sessionId: string; classId: string; name: string }) {
  const [record] = await tx.insert(feePlans).values({ ...scope, ...input, name: input.name.trim() }).returning();
  return record;
}

export async function createFeePlanLine(tx: TenantTransaction, scope: FinanceScope, planId: string, input: { headId: string; label: string; dueDate: string; amountMinor: string }) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${planId}, 0))`);
  const [plan] = await tx.select().from(feePlans).where(and(eq(feePlans.tenantId, scope.tenantId), eq(feePlans.schoolId, scope.schoolId), eq(feePlans.id, planId))).limit(1);
  if (!plan) throw new FinanceError('NOT_FOUND', 'Fee plan was not found');
  const [assigned] = await tx.select({ id: feeAssignments.id }).from(feeAssignments).where(and(eq(feeAssignments.tenantId, scope.tenantId), eq(feeAssignments.schoolId, scope.schoolId), eq(feeAssignments.planId, planId))).limit(1);
  if (assigned) throw new FinanceError('CONFLICT', 'This plan has issued charges. Create a new plan for changes');
  const [head] = await tx.select({ id: feeHeads.id }).from(feeHeads).where(and(eq(feeHeads.tenantId, scope.tenantId), eq(feeHeads.schoolId, scope.schoolId), eq(feeHeads.id, input.headId))).limit(1);
  if (!head) throw new FinanceError('NOT_FOUND', 'Fee head was not found');
  const [record] = await tx.insert(feePlanLines).values({ ...scope, planId, headId: head.id, label: input.label.trim(), dueDate: input.dueDate, amountMinor: minorUnits(input.amountMinor) }).returning();
  return { ...record, amountMinor: record.amountMinor.toString() };
}

export async function getFeePlan(tx: TenantTransaction, scope: FinanceScope, planId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${planId}, 0))`);
  const [plan] = await tx.select().from(feePlans).where(and(eq(feePlans.tenantId, scope.tenantId), eq(feePlans.schoolId, scope.schoolId), eq(feePlans.id, planId))).limit(1);
  if (!plan) throw new FinanceError('NOT_FOUND', 'Fee plan was not found');
  return plan;
}

export async function assignFeePlan(tx: TenantTransaction, scope: FinanceScope, planId: string, schoolEnrollmentId: string, currency: string, actor: FinanceActor) {
  const plan = await getFeePlan(tx, scope, planId);
  const lines = await tx.select({ line: feePlanLines, head: feeHeads }).from(feePlanLines).innerJoin(feeHeads, and(eq(feeHeads.tenantId, feePlanLines.tenantId), eq(feeHeads.schoolId, feePlanLines.schoolId), eq(feeHeads.id, feePlanLines.headId)))
    .where(and(eq(feePlanLines.tenantId, scope.tenantId), eq(feePlanLines.schoolId, scope.schoolId), eq(feePlanLines.planId, planId)));
  if (!lines.length) throw new FinanceError('INVALID', 'Add at least one fee line before assigning this plan');
  const [existing] = await tx.select().from(feeAssignments).where(and(eq(feeAssignments.tenantId, scope.tenantId), eq(feeAssignments.schoolId, scope.schoolId), eq(feeAssignments.planId, planId), eq(feeAssignments.schoolEnrollmentId, schoolEnrollmentId))).limit(1);
  if (existing) throw new FinanceError('CONFLICT', 'This plan has already been assigned to the student');
  const [assignment] = await tx.insert(feeAssignments).values({ ...scope, planId, schoolEnrollmentId }).returning();
  for (const { line, head } of lines) {
    const [charge] = await tx.insert(feeCharges).values({ ...scope, assignmentId: assignment.id, planId, planLineId: line.id, schoolEnrollmentId,
      description: `${head.name} · ${line.label}`, currency, dueDate: line.dueDate, amountMinor: line.amountMinor }).returning();
    await tx.insert(feeLedgerEntries).values({ ...scope, schoolEnrollmentId, chargeId: charge.id, kind: 'charge', amountMinor: charge.amountMinor,
      actorAccountId: actor.accountId, actorMembershipId: actor.membershipId });
  }
  return { id: assignment.id, plan, chargesIssued: lines.length };
}

async function chargeLedger(tx: TenantTransaction, scope: FinanceScope, chargeId: string) {
  const entries = await tx.select().from(feeLedgerEntries).where(and(eq(feeLedgerEntries.tenantId, scope.tenantId), eq(feeLedgerEntries.schoolId, scope.schoolId), eq(feeLedgerEntries.chargeId, chargeId))).orderBy(asc(feeLedgerEntries.createdAt));
  return entries;
}

export async function readFeeStatement(tx: TenantTransaction, scope: FinanceScope, schoolEnrollmentId: string) {
  const charges = await tx.select().from(feeCharges).where(and(eq(feeCharges.tenantId, scope.tenantId), eq(feeCharges.schoolId, scope.schoolId), eq(feeCharges.schoolEnrollmentId, schoolEnrollmentId))).orderBy(asc(feeCharges.dueDate), asc(feeCharges.id));
  const entries = await tx.select().from(feeLedgerEntries).where(and(eq(feeLedgerEntries.tenantId, scope.tenantId), eq(feeLedgerEntries.schoolId, scope.schoolId), eq(feeLedgerEntries.schoolEnrollmentId, schoolEnrollmentId))).orderBy(asc(feeLedgerEntries.createdAt), asc(feeLedgerEntries.id));
  const byCharge = new Map<string, typeof entries>();
  for (const entry of entries) byCharge.set(entry.chargeId, [...(byCharge.get(entry.chargeId) ?? []), entry]);
  const accounts = charges.map((charge) => ({ ...charge, amountMinor: charge.amountMinor.toString(),
    outstandingMinor: balanceFromEntries(byCharge.get(charge.id) ?? []).toString() }));
  return { charges: accounts, entries: entries.map((entry) => ({ ...entry, amountMinor: entry.amountMinor.toString() })),
    outstandingMinor: balanceFromEntries(entries).toString() };
}

export async function grantFeeConcession(tx: TenantTransaction, scope: FinanceScope, schoolEnrollmentId: string, chargeId: string, amountValue: string, reason: string, actor: FinanceActor) {
  const [charge] = await tx.select().from(feeCharges).where(and(eq(feeCharges.tenantId, scope.tenantId), eq(feeCharges.schoolId, scope.schoolId), eq(feeCharges.id, chargeId))).limit(1);
  if (!charge || charge.schoolEnrollmentId !== schoolEnrollmentId) throw new FinanceError('NOT_FOUND', 'Charge was not found for this student');
  const amountMinor = minorUnits(amountValue);
  const due = balanceFromEntries(await chargeLedger(tx, scope, charge.id));
  if (amountMinor > due) throw new FinanceError('INVALID', 'Concession cannot exceed the outstanding charge');
  const [entry] = await tx.insert(feeLedgerEntries).values({ ...scope, schoolEnrollmentId: charge.schoolEnrollmentId, chargeId,
    kind: 'concession', amountMinor, reason: reason.trim(), actorAccountId: actor.accountId, actorMembershipId: actor.membershipId }).returning();
  return { ...entry, amountMinor: entry.amountMinor.toString() };
}

export async function findPaymentByKey(tx: TenantTransaction, scope: FinanceScope, key: string) {
  const [payment] = await tx.select().from(feePayments).where(and(eq(feePayments.tenantId, scope.tenantId), eq(feePayments.schoolId, scope.schoolId), eq(feePayments.idempotencyKey, key))).limit(1);
  return payment;
}

export async function readFeeReceipt(tx: TenantTransaction, scope: FinanceScope, paymentId: string) {
  const [payment] = await tx.select().from(feePayments).where(and(eq(feePayments.tenantId, scope.tenantId), eq(feePayments.schoolId, scope.schoolId), eq(feePayments.id, paymentId))).limit(1);
  if (!payment) throw new FinanceError('NOT_FOUND', 'Receipt was not found');
  const entries = await tx.select().from(feeLedgerEntries).where(and(eq(feeLedgerEntries.tenantId, scope.tenantId), eq(feeLedgerEntries.schoolId, scope.schoolId), eq(feeLedgerEntries.paymentId, paymentId))).orderBy(asc(feeLedgerEntries.createdAt));
  const firstChargeId = entries.find((entry) => entry.kind === 'payment')?.chargeId;
  const [charge] = firstChargeId ? await tx.select({ currency: feeCharges.currency }).from(feeCharges).where(and(
    eq(feeCharges.tenantId, scope.tenantId), eq(feeCharges.schoolId, scope.schoolId), eq(feeCharges.id, firstChargeId),
  )).limit(1) : [];
  if (!charge) throw new FinanceError('CONFLICT', 'Receipt has no charge allocation');
  return { ...payment, receiptNumber: payment.receiptNumber.toString(), amountMinor: payment.amountMinor.toString(),
    currency: charge.currency,
    reversed: entries.some((entry) => entry.kind === 'payment_reversal'),
    allocations: entries.filter((entry) => entry.kind === 'payment').map((entry) => ({ chargeId: entry.chargeId, amountMinor: entry.amountMinor.toString() })),
    reversalReason: entries.find((entry) => entry.kind === 'payment_reversal')?.reason ?? null };
}

export async function recordFeePayment(tx: TenantTransaction, scope: FinanceScope, input: {
  schoolEnrollmentId: string; idempotencyKey: string; method: string; reference?: string | null; allocations: PaymentAllocation[];
}, actor: FinanceActor) {
  const prior = await findPaymentByKey(tx, scope, input.idempotencyKey);
  if (prior) {
    const receipt = await readFeeReceipt(tx, scope, prior.id);
    const comparable = (values: PaymentAllocation[]) => JSON.stringify(values.map((value) => `${value.chargeId}:${value.amountMinor}`).sort());
    if (prior.schoolEnrollmentId !== input.schoolEnrollmentId || prior.method !== input.method || (prior.reference ?? null) !== (input.reference?.trim() || null) ||
      comparable(receipt.allocations) !== comparable(input.allocations)) throw new FinanceError('CONFLICT', 'This payment key was already used for different details');
    return receipt;
  }
  if (!input.allocations.length || new Set(input.allocations.map((value) => value.chargeId)).size !== input.allocations.length) {
    throw new FinanceError('INVALID', 'Choose each charge once for this payment');
  }
  let amountMinor = 0n;
  let currency: string | null = null;
  for (const allocation of input.allocations) {
    const [charge] = await tx.select().from(feeCharges).where(and(eq(feeCharges.tenantId, scope.tenantId), eq(feeCharges.schoolId, scope.schoolId),
      eq(feeCharges.schoolEnrollmentId, input.schoolEnrollmentId), eq(feeCharges.id, allocation.chargeId))).limit(1);
    if (!charge) throw new FinanceError('NOT_FOUND', 'One of the charges was not found for this student');
    if (currency && charge.currency !== currency) throw new FinanceError('INVALID', 'A payment can only cover charges in one currency');
    currency = charge.currency;
    const amount = minorUnits(allocation.amountMinor);
    if (amount > balanceFromEntries(await chargeLedger(tx, scope, charge.id))) throw new FinanceError('INVALID', 'Payment exceeds the outstanding charge');
    amountMinor += amount;
  }
  await tx.insert(feeReceiptCounters).values({ ...scope, nextNumber: 1n }).onConflictDoNothing();
  const [counter] = await tx.update(feeReceiptCounters).set({ nextNumber: sql`${feeReceiptCounters.nextNumber} + 1` })
    .where(and(eq(feeReceiptCounters.tenantId, scope.tenantId), eq(feeReceiptCounters.schoolId, scope.schoolId))).returning({ nextNumber: feeReceiptCounters.nextNumber });
  const [payment] = await tx.insert(feePayments).values({ ...scope, schoolEnrollmentId: input.schoolEnrollmentId,
    receiptNumber: counter.nextNumber - 1n, idempotencyKey: input.idempotencyKey, method: input.method,
    reference: input.reference?.trim() || null, amountMinor, actorAccountId: actor.accountId, actorMembershipId: actor.membershipId }).returning();
  await tx.insert(feeLedgerEntries).values(input.allocations.map((allocation) => ({ ...scope, schoolEnrollmentId: input.schoolEnrollmentId,
    chargeId: allocation.chargeId, paymentId: payment.id, kind: 'payment', amountMinor: minorUnits(allocation.amountMinor),
    actorAccountId: actor.accountId, actorMembershipId: actor.membershipId })));
  return readFeeReceipt(tx, scope, payment.id);
}

export async function reverseFeePayment(tx: TenantTransaction, scope: FinanceScope, paymentId: string, reason: string, actor: FinanceActor) {
  const receipt = await readFeeReceipt(tx, scope, paymentId);
  if (receipt.reversed) throw new FinanceError('CONFLICT', 'This receipt has already been reversed');
  await tx.insert(feeLedgerEntries).values(receipt.allocations.map((allocation) => ({ ...scope,
    schoolEnrollmentId: receipt.schoolEnrollmentId, chargeId: allocation.chargeId, paymentId,
    kind: 'payment_reversal', amountMinor: minorUnits(allocation.amountMinor), reason: reason.trim(),
    actorAccountId: actor.accountId, actorMembershipId: actor.membershipId })));
  return readFeeReceipt(tx, scope, paymentId);
}

export async function listFeeOutstanding(tx: TenantTransaction, scope: FinanceScope) {
  const entries = await tx.select({ schoolEnrollmentId: feeLedgerEntries.schoolEnrollmentId, kind: feeLedgerEntries.kind, amountMinor: feeLedgerEntries.amountMinor })
    .from(feeLedgerEntries).where(and(eq(feeLedgerEntries.tenantId, scope.tenantId), eq(feeLedgerEntries.schoolId, scope.schoolId)));
  const balances = new Map<string, bigint>();
  for (const entry of entries) balances.set(entry.schoolEnrollmentId, (balances.get(entry.schoolEnrollmentId) ?? 0n) + balanceFromEntries([entry]));
  return [...balances].map(([schoolEnrollmentId, outstandingMinor]) => ({ schoolEnrollmentId, outstandingMinor: outstandingMinor.toString() }))
    .filter((entry) => BigInt(entry.outstandingMinor) !== 0n);
}
