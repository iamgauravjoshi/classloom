import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { readServerSession } from "@/lib/auth-api";
import { StudentsClient } from "./students-client";

export default async function StudentsPage() {
  const session = await readServerSession((await cookies()).toString());
  if (!session) redirect("/login");
  if (session.workspaceSelectionRequired || !session.activeMembership) redirect("/select-workspace");
  return <AppShell accountName={session.account.displayName ?? session.account.email} accountEmail={session.account.email}>
    <StudentsClient />
  </AppShell>;
}
