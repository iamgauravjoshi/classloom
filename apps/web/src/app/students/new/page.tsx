import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { readServerSession } from "@/lib/auth-api";
import { StudentNewClient } from "./student-new-client";

export default async function StudentNewPage() {
  const session = await readServerSession((await cookies()).toString());
  if (!session) redirect("/login");
  if (session.workspaceSelectionRequired || !session.activeMembership) redirect("/select-workspace");
  return <AppShell accountName={session.account.displayName ?? session.account.email} accountEmail={session.account.email}>
    <StudentNewClient />
  </AppShell>;
}
