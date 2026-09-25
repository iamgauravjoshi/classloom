"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authRequest, login, getSession } from "@/lib/auth-api";
import { LogoutButton } from "@/components/logout-button";

type Mode = "login" | "forgot" | "reset" | "invite" | "invite-existing";

export function AuthForm({ mode, token = "", currentEmail }: { mode: Mode; token?: string; currentEmail?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const title = { login: "Welcome back", forgot: "Reset your password", reset: "Choose a new password", invite: "Join your school", "invite-existing": "Join your school" }[mode];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const data = new FormData(event.currentTarget);
    const values = Object.fromEntries([...data.entries()].map(([key, value]) => [key, String(value)]));
    try {
      if (mode === "login") {
        await login({ email: values.email!, password: values.password! });
        const session = await getSession();
        const returnTo = new URLSearchParams(window.location.search).get("returnTo");
        router.push(returnTo?.startsWith("/accept-invitation?token=") ? returnTo : session.memberships.length === 0 || session.workspaceSelectionRequired ? "/select-workspace" : "/dashboard");
        router.refresh();
      } else if (mode === "forgot") {
        await authRequest("password-reset/request", values);
        setMessage("If an account matches that email, a reset link will be sent.");
      } else if (mode === "reset") {
        await authRequest("password-reset/confirm", { ...values, token });
        setMessage("Your password has been updated. You can sign in now.");
      } else if (mode === "invite-existing") {
        await authRequest("invitations/accept-existing", { token });
        setMessage("Your school workspace has been added.");
        router.push("/dashboard"); router.refresh();
      } else {
        await authRequest("invitations/accept", { ...values, token });
        setMessage("Your account is ready. Sign in to continue.");
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The request could not be completed."); }
    finally { setBusy(false); }
  }

  return <main className="auth-page"><section className="auth-card">
    <Link href="/login" className="auth-brand"><span className="auth-mark">C</span>ClassLoom</Link>
    <p className="auth-eyebrow">SCHOOL MANAGEMENT</p><h1>{title}</h1>
    <p className="auth-description">{mode === "login" ? "Sign in with your school account to continue." : "Enter your details below to continue securely."}</p>
    {mode === "invite-existing" && currentEmail ? <div className="auth-description">Signed in as <strong>{currentEmail}</strong>. If this invitation was sent to another account, sign out to switch accounts. <LogoutButton returnTo={`/accept-invitation?token=${encodeURIComponent(token)}`} /></div> : null}
    <form onSubmit={submit} className="auth-form">
      {mode === "login" || mode === "forgot" ? <label>Email address<Input name="email" type="email" autoComplete="email" required maxLength={254} /></label> : null}
      {mode === "invite" ? <label>Your name<Input name="displayName" autoComplete="name" maxLength={120} /></label> : null}
      {mode === "login" || mode === "invite" || mode === "reset" ? <label>{mode === "login" ? "Password" : "Create password"}<Input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required maxLength={1024} />{mode !== "login"&&<small>Use 15–256 Unicode code points.</small>}</label> : null}
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      {message ? <p className="auth-success" role="status">{message}</p> : null}
      <Button type="submit" disabled={busy} className="auth-submit">{busy ? "Please wait…" : mode === "login" ? "Sign in" : mode === "forgot" ? "Send reset link" : mode === "reset" ? "Update password" : "Accept invitation"}</Button>
    </form>
    <div className="auth-links">{mode === "login" ? <Link href="/forgot-password">Forgot password?</Link> : mode === "invite" ? <Link href={`/login?returnTo=${encodeURIComponent(`/accept-invitation?token=${token}`)}`}>Already have an account? Sign in</Link> : <Link href="/login">Back to sign in</Link>}</div>
  </section></main>;
}
