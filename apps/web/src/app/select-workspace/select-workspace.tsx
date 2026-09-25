"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { AuthSession, Membership } from "@/lib/auth-api";
import { authRequest } from "@/lib/auth-api";
import { LogoutButton } from "@/components/logout-button";
export function SelectWorkspace({ session }: { session: AuthSession }) {
  const router=useRouter(); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  async function choose(membership: Membership) {
    setBusy(true);setError("");
    try { await authRequest("membership",{membershipId:membership.id});router.push("/dashboard");router.refresh(); }
    catch(cause){setError(cause instanceof Error?cause.message:"Could not select workspace.");setBusy(false);}
  }
  return <main className="auth-page"><section className="auth-card workspace-card"><div className="workspace-heading"><div><p className="auth-eyebrow">YOUR ACCOUNT</p><h1>{session.memberships.length ? "Select a workspace" : "No workspace access yet"}</h1></div><LogoutButton/></div><p className="auth-description">{session.memberships.length ? "Choose the school you want to open." : "Your account is active, but it has no active school memberships. Contact your school administrator for an invitation."}</p>{error&&<p className="auth-error" role="alert">{error}</p>}<div className="workspace-list">{session.memberships.map((membership,index)=><Button key={membership.id} variant="outline" disabled={busy} className="workspace-choice" onClick={()=>void choose(membership)}><span className="auth-mark">{index+1}</span><span><strong>School workspace</strong><small>Workspace · {membership.tenantId.slice(0,8)}</small></span></Button>)}</div></section></main>;
}
