import { describe, expect, it } from "vitest";
import { formatDateOnly, parseDateOnly } from "./date-only";

describe("academic session date-only values", () => {
  it("formats a selected local calendar day without a UTC shift", () => {
    expect(formatDateOnly(new Date(2026, 2, 31))).toBe("2026-03-31");
  });

  it("parses an API date as the same local calendar day", () => {
    const date = parseDateOnly("2026-03-31");

    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(2);
    expect(date.getDate()).toBe(31);
  });
});
