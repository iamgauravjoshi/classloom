import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { readServerSession } from "@/lib/auth-api";
import { StudentProfileClient } from "./student-profile-client";

export default async function StudentProfilePage({ params }: { params: Promise<{ studentId: string }> }) {
  const session = await readServerSession((await cookies()).toString());
  if (!session) redirect("/login");
  if (session.workspaceSelectionRequired || !session.activeMembership) redirect("/select-workspace");
  const { studentId } = await params;
  return <AppShell accountName={session.account.displayName ?? session.account.email} accountEmail={session.account.email}>
    <StudentProfileClient studentId={studentId} />
  </AppShell>;
}
