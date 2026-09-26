"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { authRequest, login, getSession } from "@/lib/auth-api";
import { LogoutButton } from "@/components/logout-button";
import { toast } from "@/components/ui/toast";
import { ApiRequestError, validateNewPassword } from "@/lib/api-error";

type Mode = "login" | "forgot" | "reset" | "invite" | "invite-existing";

export function AuthForm({ mode, token = "", currentEmail }: { mode: Mode; token?: string; currentEmail?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const title = { login: "Welcome back", forgot: "Reset your password", reset: "Choose a new password", invite: "Join your school", "invite-existing": "Join your school" }[mode];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage(""); setFieldErrors({});
    const data = new FormData(event.currentTarget);
    const values = Object.fromEntries([...data.entries()].map(([key, value]) => [key, String(value)]));
    if ((mode === "invite" || mode === "reset") && values.password) {
      const passwordError = validateNewPassword(values.password);
      if (passwordError) {
        setFieldErrors({ password: passwordError }); setError(passwordError);
        toast.add({ type: "error", title: "Check your password", description: passwordError, priority: "high" });
        return;
      }
    }
    if ((mode === "invite" || mode === "invite-existing" || mode === "reset") && !token) {
      const detail = "This link is incomplete. Open the full link from your email and try again.";
      setError(detail); toast.add({ type: "error", title: "Link is incomplete", description: detail, priority: "high" });
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") {
        await login({ email: values.email!, password: values.password! });
        toast.add({ type: "success", title: "Signed in", description: "Opening your workspace." });
        const session = await getSession();
        const returnTo = new URLSearchParams(window.location.search).get("returnTo");
        router.push(returnTo?.startsWith("/accept-invitation?token=") ? returnTo : session.memberships.length === 0 || session.workspaceSelectionRequired ? "/select-workspace" : "/dashboard");
        router.refresh();
      } else if (mode === "forgot") {
        await authRequest("password-reset/request", values);
        setMessage("If an account matches that email, a reset link will be sent.");
        toast.add({ type: "success", title: "Request received", description: "Check your email for the reset link if an account matches." });
      } else if (mode === "reset") {
        await authRequest("password-reset/confirm", { ...values, token });
        setMessage("Your password has been updated. You can sign in now.");
        toast.add({ type: "success", title: "Password updated", description: "You can sign in with your new password." });
      } else if (mode === "invite-existing") {
        await authRequest("invitations/accept-existing", { token });
        setMessage("Your school workspace has been added.");
        toast.add({ type: "success", title: "Invitation accepted", description: "Your school workspace is ready." });
        router.push("/dashboard"); router.refresh();
      } else {
        await authRequest("invitations/accept", { ...values, token });
        setMessage("Your account is ready. Sign in to continue.");
        toast.add({ type: "success", title: "Account created", description: "Sign in to continue." });
      }
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "The request could not be completed. Please try again.";
      setError(detail);
      setFieldErrors(cause instanceof ApiRequestError ? cause.fields : {});
      toast.add({ type: "error", title: "Please check your details", description: detail, priority: "high" });
    }
    finally { setBusy(false); }
  }

  return <main className="auth-page"><section className="auth-card">
    <Link href="/login" className="auth-brand"><span className="auth-mark">C</span>ClassLoom</Link>
    <p className="auth-eyebrow">SCHOOL MANAGEMENT</p><h1>{title}</h1>
    <p className="auth-description">{mode === "login" ? "Sign in with your school account to continue." : "Enter your details below to continue securely."}</p>
    {mode === "invite-existing" && currentEmail ? <div className="auth-description">Signed in as <strong>{currentEmail}</strong>. If this invitation was sent to another account, sign out to switch accounts. <LogoutButton returnTo={`/accept-invitation?token=${encodeURIComponent(token)}`} /></div> : null}
    <form onSubmit={submit} onInput={(event) => { const name = (event.target as HTMLInputElement).name; if (name) setFieldErrors((current) => { const next = { ...current }; delete next[name]; return next; }); }} className="auth-form">
      <FieldGroup className="gap-4">
      {mode === "login" || mode === "forgot" ? <Field data-invalid={Boolean(fieldErrors.email) || undefined}><FieldLabel htmlFor="auth-email">Email address</FieldLabel><Input id="auth-email" name="email" type="email" autoComplete="email" required maxLength={254} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "auth-email-error" : undefined} />{fieldErrors.email && <FieldError id="auth-email-error">{fieldErrors.email}</FieldError>}</Field> : null}
      {mode === "invite" ? <Field><FieldLabel htmlFor="auth-name">Your name</FieldLabel><Input id="auth-name" name="displayName" autoComplete="name" maxLength={120} /></Field> : null}
      {mode === "login" || mode === "invite" || mode === "reset" ? <Field data-invalid={Boolean(fieldErrors.password) || undefined}><FieldLabel htmlFor="auth-password">{mode === "login" ? "Password" : "Create password"}</FieldLabel><Input id="auth-password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required maxLength={1024} aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? "auth-password-error" : undefined} />{mode !== "login"&&<FieldDescription>Use 15–256 characters.</FieldDescription>}{fieldErrors.password && <FieldError id="auth-password-error">{fieldErrors.password}</FieldError>}</Field> : null}
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      {message ? <p className="auth-success" role="status">{message}</p> : null}
      <Button type="submit" disabled={busy} className="auth-submit">{busy ? "Please wait…" : mode === "login" ? "Sign in" : mode === "forgot" ? "Send reset link" : mode === "reset" ? "Update password" : "Accept invitation"}</Button>
      </FieldGroup>
    </form>
    <div className="auth-links">{mode === "login" ? <Link href="/forgot-password">Forgot password?</Link> : mode === "invite" ? <Link href={`/login?returnTo=${encodeURIComponent(`/accept-invitation?token=${token}`)}`}>Already have an account? Sign in</Link> : <Link href="/login">Back to sign in</Link>}</div>
  </section></main>;
}
