export class ApiRequestError extends Error {
  constructor(message: string, readonly fields: Record<string, string> = {}, readonly rows: { row: number; field: string; message: string }[] = []) { super(message); }
}

export function responseError(payload: unknown, fallback = "The request could not be completed. Please try again."): ApiRequestError {
  if (!payload || typeof payload !== "object") return new ApiRequestError(fallback);
  const value = payload as { message?: unknown; details?: { fields?: unknown; rows?: unknown } };
  const message = typeof value.message === "string" && value.message.trim() ? value.message : fallback;
  const rawFields = value.details?.fields;
  const fields: Record<string, string> = {};
  if (rawFields && typeof rawFields === "object" && !Array.isArray(rawFields)) {
    for (const [key, fieldMessage] of Object.entries(rawFields)) {
      if (typeof fieldMessage === "string" && fieldMessage.trim()) fields[key] = fieldMessage;
    }
  }
  const rows = Array.isArray(value.details?.rows) ? value.details.rows.slice(0, 1000).flatMap((entry: unknown) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as { row?: unknown; field?: unknown; message?: unknown };
    return Number.isInteger(row.row) && (row.row as number) >= 1 && typeof row.field === "string" && typeof row.message === "string" && row.message.trim()
      ? [{ row: row.row as number, field: row.field, message: row.message }] : [];
  }) : [];
  return new ApiRequestError(message, fields, rows);
}

export function validateNewPassword(value: string): string | null {
  const length = Array.from(value).length;
  if (length < 15) return "Password must contain at least 15 characters";
  if (length > 256) return "Password must contain no more than 256 characters";
  return null;
}
