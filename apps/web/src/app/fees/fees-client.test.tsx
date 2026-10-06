// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FeesClient } from "./fees-client";

const api = vi.hoisted(() => ({
  listFinanceSchools: vi.fn(),
  getFeeSetup: vi.fn(),
  listFinanceEnrollments: vi.fn(),
  listFeeOutstanding: vi.fn(),
  readFeeStatement: vi.fn(),
  recordFeePayment: vi.fn(),
  readFeeReceipt: vi.fn(),
}));
vi.mock("@/lib/finance-api", async (original) => ({
  ...(await original<typeof import("@/lib/finance-api")>()),
  ...api,
}));
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  api.listFinanceSchools.mockResolvedValue([
    {
      id: "school-a",
      name: "North School",
      currency: "INR",
      timezone: "Asia/Kolkata",
      canRead: true,
      canManage: true,
      canRecord: true,
      canAdjust: true,
    },
  ]);
  api.getFeeSetup.mockResolvedValue({
    heads: [],
    plans: [],
    lines: [],
    academic: { sessions: [], classes: [] },
  });
  api.listFinanceEnrollments.mockResolvedValue([
    {
      id: "enrollment-a",
      givenName: "Asha",
      familyName: "Shah",
      admissionNumber: "ADM-1",
    },
  ]);
  api.listFeeOutstanding.mockResolvedValue([]);
  api.readFeeStatement.mockResolvedValue({
    outstandingMinor: "10000",
    charges: [
      {
        id: "charge-a",
        description: "Tuition",
        dueDate: "2026-10-01",
        amountMinor: "10000",
        outstandingMinor: "10000",
      },
    ],
    entries: [],
  });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe("student finance task forms", () => {
  it("retains an entered payment when switching to concessions and keeps a failed save recoverable", async () => {
    const user = userEvent.setup();
    render(<FeesClient />);
    await user.click(
      await screen.findByRole("combobox", { name: "Student enrollment" }),
    );
    await user.click(
      await screen.findByRole("option", { name: "Asha Shah · ADM-1" }),
    );
    await user.click(await screen.findByRole("combobox", { name: "Charge" }));
    await user.click(
      await screen.findByRole("option", { name: "Tuition · ₹100.00" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Amount (INR)" }),
      "25.00",
    );
    await user.click(screen.getByRole("tab", { name: "Grant concession" }));
    expect(
      screen.queryByRole("heading", { name: "Record offline payment" }),
    ).toBeNull();
    await user.click(screen.getByRole("tab", { name: "Record payment" }));
    expect(
      (
        screen.getByRole("textbox", {
          name: "Amount (INR)",
        }) as HTMLInputElement
      ).value,
    ).toBe("25.00");
    api.recordFeePayment.mockRejectedValueOnce(
      new Error("Payment could not be saved. Please retry."),
    );
    await user.click(screen.getByRole("button", { name: "Record payment" }));
    expect(
      await screen.findByText("Payment could not be saved. Please retry."),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("textbox", {
          name: "Amount (INR)",
        }) as HTMLInputElement
      ).value,
    ).toBe("25.00");
    expect(api.recordFeePayment).toHaveBeenCalledWith(
      "school-a",
      expect.objectContaining({
        schoolEnrollmentId: "enrollment-a",
        allocations: [{ chargeId: "charge-a", amountMinor: "2500" }],
      }),
    );
  });
});
