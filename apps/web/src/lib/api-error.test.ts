import { describe, expect, it } from "vitest";
import { ApiRequestError, responseError, validateNewPassword } from "./api-error";

describe("form feedback", () => {
  it("preserves safe field validation messages from the API", () => {
    const error = responseError({ message: "Password must contain at least 15 characters", details: { fields: { password: "Password must contain at least 15 characters" } } });
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error.fields.password).toMatch(/15 characters/);
  });

  it("checks the same Unicode character length as the server", () => {
    expect(validateNewPassword("short")).toMatch(/15 characters/);
    expect(validateNewPassword("🔒".repeat(15))).toBeNull();
  });
});
