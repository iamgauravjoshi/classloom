import { describe, expect, it } from "vitest";
import { percentageToBasisPoints } from "./results-api";
describe("grading percentages", () => {
  it("preserves exact hundredths and uses percentage-specific validation messages", () => {
    expect(percentageToBasisPoints("79.99")).toBe(7999);
    expect(percentageToBasisPoints("0")).toBe(0);
    expect(percentageToBasisPoints("100")).toBe(10000);
    for (const input of ["101", "-1", "79.999", "", "NaN"])
      expect(() => percentageToBasisPoints(input)).toThrow(
        "percentage between 0 and 100",
      );
  });
});
