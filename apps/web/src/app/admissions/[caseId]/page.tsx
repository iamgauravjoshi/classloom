import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { readServerSession } from '@/lib/auth-api';
import { AdmissionCaseClient } from './admission-case-client';

export default async function AdmissionCasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const session = await readServerSession((await cookies()).toString());
  if (!session) redirect('/login');
  if (session.workspaceSelectionRequired || !session.activeMembership) redirect('/select-workspace');
  const { caseId } = await params;
  return <AppShell accountName={session.account.displayName ?? session.account.email} accountEmail={session.account.email}><AdmissionCaseClient caseId={caseId} /></AppShell>;
}
