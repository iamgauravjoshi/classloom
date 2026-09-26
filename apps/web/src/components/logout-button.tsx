"use client";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { authRequest } from "@/lib/auth-api";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
export function LogoutButton({ returnTo = "/login" }: { returnTo?: string }) {
  const router=useRouter();
  async function logout(){
    try { await authRequest("logout",{});toast.add({ type: "success", title: "Signed out" });router.replace(returnTo);router.refresh(); }
    catch (cause) { toast.add({ type: "error", title: "Could not sign out", description: cause instanceof Error ? cause.message : "Please try again.", priority: "high" }); }
  }
  return <Button type="button" variant="outline" size="icon" className="ml-1" aria-label="Sign out" title="Sign out" onClick={()=>void logout()}><LogOut /></Button>;
}
