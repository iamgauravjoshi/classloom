import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { readServerSession } from "@/lib/auth-api";
import { ReportDetailClient } from "./report-detail-client";
export default async function ReportPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const session = await readServerSession((await cookies()).toString());
  if (!session) redirect("/login");
  if (session.workspaceSelectionRequired || !session.activeMembership)
    redirect("/select-workspace");
  const { reportId } = await params;
  return (
    <AppShell
      accountName={session.account.displayName ?? session.account.email}
      accountEmail={session.account.email}
    >
      <ReportDetailClient id={reportId} />
    </AppShell>
  );
}
