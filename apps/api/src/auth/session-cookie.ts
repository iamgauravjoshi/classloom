export function readSessionCookie(cookieHeader: string | undefined, cookieName: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== cookieName) continue;
    try {
      const value = decodeURIComponent(part.slice(separator + 1).trim());
      return value || null;
    } catch {
      return null;
    }
  }
  return null;
}
