// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GuardiansClient } from "./guardians-client";

const api = vi.hoisted(() => ({
  listPeopleSchools: vi.fn(),
  listGuardians: vi.fn(),
}));
vi.mock("@/lib/students-api", () => api);
const school = {
  id: "school-a",
  name: "School A",
  code: "A",
  canReadGuardians: true,
  canManageGuardians: true,
};
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
  api.listPeopleSchools.mockResolvedValue([school]);
  api.listGuardians.mockResolvedValue({ items: [], nextCursor: null });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("guardian directory", () => {
  it("does not flash empty state while loading", async () => {
    let resolvePage!: (value: { items: never[]; nextCursor: null }) => void;
    api.listGuardians.mockReturnValue(
      new Promise((resolve) => {
        resolvePage = resolve;
      }),
    );
    render(<GuardiansClient />);
    await screen.findByText("Guardian directory");
    expect(screen.queryByText("No guardians found")).toBeNull();
    resolvePage({ items: [], nextCursor: null });
    expect(await screen.findByText("No guardians found")).toBeTruthy();
  });

  it("links a guardian to the selected school", async () => {
    api.listGuardians.mockResolvedValue({
      items: [
        {
          id: "guardian-a",
          guardianCode: "G1",
          givenName: "Mira",
          familyName: "Shah",
          preferredName: null,
          status: "active",
        },
      ],
      nextCursor: null,
    });
    render(<GuardiansClient />);
    expect(
      (
        await screen.findByRole("link", { name: "View Mira Shah profile" })
      ).getAttribute("href"),
    ).toBe("/guardians/guardian-a?school=school-a");
  });
});
