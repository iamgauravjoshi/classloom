"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { AuthSession, Membership } from "@/lib/auth-api";
import { authRequest } from "@/lib/auth-api";
import { LogoutButton } from "@/components/logout-button";
import { toast } from "@/components/ui/toast";
import { AuthFrame } from "@/components/auth-frame";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { School, ArrowRight } from "lucide-react";
export function SelectWorkspace({ session }: { session: AuthSession }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function choose(membership: Membership) {
    setBusy(true);
    setError("");
    try {
      await authRequest("membership", { membershipId: membership.id });
      toast.add({
        type: "success",
        title: "Workspace selected",
        description: "Opening your dashboard.",
      });
      router.push("/dashboard");
      router.refresh();
    } catch (cause) {
      const detail =
        cause instanceof Error
          ? cause.message
          : "Could not select workspace. Please try again.";
      setError(detail);
      toast.add({
        type: "error",
        title: "Could not open workspace",
        description: detail,
        priority: "high",
      });
      setBusy(false);
    }
  }
  return (
    <AuthFrame
      title={
        session.memberships.length
          ? "Select a workspace"
          : "No workspace access yet"
      }
      description={
        session.memberships.length
          ? "Choose one of your active school workspaces to continue."
          : "Your account is active, but it has no active school memberships. Contact your school administrator for an invitation."
      }
      footer={
        <div className="flex items-center justify-center gap-3">
          <span>Signed in as {session.account.email}</span>
          <LogoutButton />
        </div>
      }
    >
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Could not open workspace</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-3">
        {session.memberships.map((membership, index) => (
          <Button
            key={membership.id}
            variant="outline"
            disabled={busy}
            className="h-auto min-h-20 justify-start gap-3 p-4 text-left"
            onClick={() => void choose(membership)}
          >
            <School data-icon="inline-start" />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <strong>School workspace {index + 1}</strong>
              <span className="text-xs text-muted-foreground">
                Workspace reference · {membership.tenantId.slice(0, 8)}
              </span>
            </span>
            <ArrowRight data-icon="inline-end" />
          </Button>
        ))}
      </div>
    </AuthFrame>
  );
}
