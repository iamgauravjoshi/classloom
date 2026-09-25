const API_ORIGIN = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
const BROWSER_AUTH_PREFIX = "/api/auth";

export type Membership = { id: string; tenantId: string; status: string };
export type AuthSession = {
  account: { id: string; email: string; displayName: string | null };
  activeMembership: Membership | null;
  memberships: Membership[];
  workspaceSelectionRequired: boolean;
};

export async function authRequest<T>(path: string, body?: Record<string, string | undefined>): Promise<T> {
  const response = await fetch(`${BROWSER_AUTH_PREFIX}/${path}`, {
    method: body ? "POST" : "GET",
    credentials: "include",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json", "X-ClassLoom-Request": "1" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.message === "string" ? payload.message : "The request could not be completed.");
  }
  return payload as T;
}

export async function readServerSession(cookieHeader: string): Promise<AuthSession | null> {
  try {
    const response = await fetch(`${API_ORIGIN}/auth/session`, {
      headers: { Cookie: cookieHeader }, cache: "no-store",
    });
    if (!response.ok) return null;
    return await response.json() as AuthSession;
  } catch {
    return null;
  }
}

export const login = (input: { email: string; password: string }) => authRequest<{ workspaceSelectionRequired: boolean }>("login", input);
export const logout = () => authRequest<{ loggedOut: boolean }>("logout", {});
export const getSession = () => authRequest<AuthSession>("session");
export const listMemberships = () => authRequest<Membership[]>("memberships");
export const selectMembership = (membershipId: string) => authRequest<{ activeMembershipId: string }>("membership", { membershipId });
export const acceptInvitation = (input: { token: string; password: string; displayName?: string }) => authRequest<{ accepted: boolean }>("invitations/accept", input);
export const requestPasswordReset = (email: string) => authRequest<{ accepted: boolean }>("password-reset/request", { email });
export const confirmPasswordReset = (input: { token: string; password: string }) => authRequest<{ reset: boolean }>("password-reset/confirm", input);
