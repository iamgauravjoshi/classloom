import { apiRequest } from './people-enrollment-request';

const prefix = '/api/finance';
const schoolPath = (schoolId: string) => `${prefix}/schools/${schoolId}`;

export type FinanceSchool = { id: string; name: string; currency: string; timezone: string; canRead: boolean; canManage: boolean; canRecord: boolean; canAdjust: boolean };
export type FeeHead = { id: string; code: string; name: string };
export type FeePlan = { id: string; sessionId: string; classId: string; name: string };
export type FeeLine = { id: string; planId: string; headId: string; label: string; dueDate: string; amountMinor: string };
export type FeeSetup = { heads: FeeHead[]; plans: FeePlan[]; lines: FeeLine[]; academic: {
  sessions: { id: string; name: string; startDate: string; endDate: string; status: string }[];
  classes: { id: string; sessionId: string; name: string }[];
} };
export type FinanceEnrollment = { id: string; studentId: string; admissionNumber: string; status: string; givenName: string; familyName: string };
export type FeeCharge = { id: string; schoolEnrollmentId: string; description: string; dueDate: string; currency: string; amountMinor: string; outstandingMinor: string };
export type FeeLedgerEntry = { id: string; chargeId: string; paymentId: string | null; kind: string; amountMinor: string; reason: string | null; createdAt: string };
export type FeeStatement = { charges: FeeCharge[]; entries: FeeLedgerEntry[]; outstandingMinor: string };
export type FeeReceipt = { id: string; receiptNumber: string; schoolEnrollmentId: string; currency: string; method: string; reference: string | null; amountMinor: string; reversed: boolean; reversalReason: string | null; createdAt: string; allocations: { chargeId: string; amountMinor: string }[] };

export const listFinanceSchools = () => apiRequest<FinanceSchool[]>(`${prefix}/schools`);
export const getFeeSetup = (schoolId: string) => apiRequest<FeeSetup>(`${schoolPath(schoolId)}/setup`);
export const listFinanceEnrollments = (schoolId: string) => apiRequest<FinanceEnrollment[]>(`${schoolPath(schoolId)}/enrollments`);
export const readFeeStatement = (schoolId: string, schoolEnrollmentId: string) => apiRequest<FeeStatement>(`${schoolPath(schoolId)}/statements/${schoolEnrollmentId}`);
export const listFeeOutstanding = (schoolId: string) => apiRequest<{ schoolEnrollmentId: string; outstandingMinor: string }[]>(`${schoolPath(schoolId)}/outstanding`);
export const createFeeHead = (schoolId: string, input: { code: string; name: string }) => apiRequest<FeeHead>(`${schoolPath(schoolId)}/heads`, 'POST', input);
export const createFeePlan = (schoolId: string, input: { sessionId: string; classId: string; name: string }) => apiRequest<FeePlan>(`${schoolPath(schoolId)}/plans`, 'POST', input);
export const createFeeLine = (schoolId: string, planId: string, input: { headId: string; label: string; dueDate: string; amountMinor: string }) => apiRequest<FeeLine>(`${schoolPath(schoolId)}/plans/${planId}/lines`, 'POST', input);
export const assignFeePlan = (schoolId: string, planId: string, schoolEnrollmentId: string) => apiRequest<{ id: string; chargesIssued: number }>(`${schoolPath(schoolId)}/plans/${planId}/assignments`, 'POST', { schoolEnrollmentId });
export const grantFeeConcession = (schoolId: string, input: { schoolEnrollmentId: string; chargeId: string; amountMinor: string; reason: string }) => apiRequest<FeeLedgerEntry>(`${schoolPath(schoolId)}/concessions`, 'POST', input);
export const recordFeePayment = (schoolId: string, input: { schoolEnrollmentId: string; idempotencyKey: string; method: string; reference?: string; allocations: { chargeId: string; amountMinor: string }[] }) => apiRequest<FeeReceipt>(`${schoolPath(schoolId)}/payments`, 'POST', input);
export const readFeeReceipt = (schoolId: string, paymentId: string) => apiRequest<FeeReceipt>(`${schoolPath(schoolId)}/payments/${paymentId}`);
export const reverseFeePayment = (schoolId: string, paymentId: string, reason: string) => apiRequest<FeeReceipt>(`${schoolPath(schoolId)}/payments/${paymentId}/reversal`, 'POST', { reason });

export function currencyDigits(currency: string) {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2; }
  catch { return 2; }
}

export function decimalToMinor(value: string, currency: string): string {
  const digits = currencyDigits(currency);
  const match = new RegExp(digits ? `^([0-9]+)(?:\\.([0-9]{1,${digits}}))?$` : '^([0-9]+)$').exec(value.trim());
  if (!match) throw new Error(`Enter an amount with at most ${digits} decimal places`);
  const result = BigInt(match[1]) * BigInt(10) ** BigInt(digits) + BigInt((match[2] ?? '').padEnd(digits, '0') || '0');
  if (result <= BigInt(0) || result > BigInt('999999999999999')) throw new Error('Enter an amount greater than zero and within the allowed range');
  return result.toString();
}

export function formatMinor(value: string, currency: string) {
  const digits = currencyDigits(currency);
  const divisor = BigInt(10) ** BigInt(digits);
  const amount = BigInt(value);
  const whole = amount / divisor;
  const fraction = (amount % divisor).toString().padStart(digits, '0');
  const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(whole);
  return digits ? `${formatted}.${fraction}` : formatted;
}
