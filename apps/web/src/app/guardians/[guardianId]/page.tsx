import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { readServerSession } from "@/lib/auth-api";
import { GuardianProfileClient } from "./guardian-profile-client";

export default async function GuardianProfilePage({ params }: { params: Promise<{ guardianId: string }> }) {
  const session = await readServerSession((await cookies()).toString());
  if (!session) redirect("/login");
  if (session.workspaceSelectionRequired || !session.activeMembership) redirect("/select-workspace");
  const { guardianId } = await params;
  return <AppShell accountName={session.account.displayName ?? session.account.email} accountEmail={session.account.email}>
    <GuardianProfileClient guardianId={guardianId} />
  </AppShell>;
}
