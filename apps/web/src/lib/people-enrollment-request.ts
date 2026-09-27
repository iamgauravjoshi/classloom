import { responseError } from "./api-error";

export async function apiRequest<T>(path: string, method = "GET", body?: object): Promise<T> {
  const response = await fetch(path, {
    method, credentials: "include", cache: "no-store",
    headers: method === "GET" ? undefined : { "content-type": "application/json", "x-classloom-request": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw responseError(data, "The request could not be completed. Please try again.");
  return data as T;
}

export function queryString(filters: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== "") query.set(key, String(value));
  const text = query.toString();
  return text ? `?${text}` : "";
}
