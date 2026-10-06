import { AppShell } from "@/components/app-shell";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readServerSession } from "@/lib/auth-api";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const session = await readServerSession((await cookies()).toString());
  if (!session) redirect("/login");
  if (session.workspaceSelectionRequired || session.memberships.length === 0)
    redirect("/select-workspace");
  const firstName = session.account.displayName?.includes("@")
    ? ""
    : (session.account.displayName?.split(" ")[0] ?? "");
  return (
    <AppShell
      accountName={session.account.displayName ?? session.account.email}
      accountEmail={session.account.email}
    >
      <DashboardClient name={firstName} />
    </AppShell>
  );
}
