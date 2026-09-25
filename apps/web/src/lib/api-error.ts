export class ApiRequestError extends Error {
  constructor(message: string, readonly fields: Record<string, string> = {}) { super(message); }
}

export function responseError(payload: unknown, fallback = "The request could not be completed. Please try again."): ApiRequestError {
  if (!payload || typeof payload !== "object") return new ApiRequestError(fallback);
  const value = payload as { message?: unknown; details?: { fields?: unknown } };
  const message = typeof value.message === "string" && value.message.trim() ? value.message : fallback;
  const rawFields = value.details?.fields;
  const fields: Record<string, string> = {};
  if (rawFields && typeof rawFields === "object" && !Array.isArray(rawFields)) {
    for (const [key, fieldMessage] of Object.entries(rawFields)) {
      if (typeof fieldMessage === "string" && fieldMessage.trim()) fields[key] = fieldMessage;
    }
  }
  return new ApiRequestError(message, fields);
}

export function validateNewPassword(value: string): string | null {
  const length = Array.from(value).length;
  if (length < 15) return "Password must contain at least 15 characters";
  if (length > 256) return "Password must contain no more than 256 characters";
  return null;
}
