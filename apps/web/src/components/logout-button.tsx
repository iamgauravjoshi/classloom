"use client";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { authRequest } from "@/lib/auth-api";
export function LogoutButton({ returnTo = "/login" }: { returnTo?: string }) {
  const router=useRouter();
  async function logout(){ try{ await authRequest("logout",{}); } finally { router.replace(returnTo);router.refresh(); } }
  return <button type="button" className="logout-button" aria-label="Sign out" title="Sign out" onClick={()=>void logout()}><LogOut size={17}/></button>;
}
