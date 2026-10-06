"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { authRequest } from "@/lib/auth-api";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
export function LogoutButton({ returnTo = "/login" }: { returnTo?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function logout() {
    if (busy) return;
    setBusy(true);
    try {
      await authRequest("logout", {});
      toast.add({ type: "success", title: "Signed out" });
      router.replace(returnTo);
      router.refresh();
    } catch (cause) {
      toast.add({
        type: "error",
        title: "Could not sign out",
        description:
          cause instanceof Error ? cause.message : "Please try again.",
        priority: "high",
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={busy}
      aria-label={busy ? "Signing out" : "Sign out"}
      title="Sign out"
      onClick={() => void logout()}
    >
      <LogOut />
    </Button>
  );
}
