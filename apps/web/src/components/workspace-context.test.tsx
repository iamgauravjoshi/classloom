// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { WorkspaceProvider, useWorkspace } from "./workspace-context";

const api = vi.hoisted(() => ({
  people: vi.fn(),
  academic: vi.fn(),
  timetable: vi.fn(),
  attendance: vi.fn(),
  admissions: vi.fn(),
  finance: vi.fn(),
  examinations: vi.fn(),
  results: vi.fn(),
}));
vi.mock("@/lib/students-api", () => ({ listPeopleSchools: api.people }));
vi.mock("@/lib/academics-api", () => ({ listAcademicSchools: api.academic }));
vi.mock("@/lib/timetable-api", () => ({ listTimetableSchools: api.timetable }));
vi.mock("@/lib/attendance-api", () => ({
  listAttendanceSchools: api.attendance,
}));
vi.mock("@/lib/admissions-api", () => ({
  listAdmissionSchools: api.admissions,
}));
vi.mock("@/lib/finance-api", () => ({ listFinanceSchools: api.finance }));
vi.mock("@/lib/examinations-api", () => ({
  listExamSchools: api.examinations,
}));
vi.mock("@/lib/results-api", () => ({ resultAccess: api.results }));

function WorkspaceProbe() {
  const workspace = useWorkspace();
  return (
    <>
      <p>{workspace.loading ? "Loading" : "Ready"}</p>
      <p>{workspace.people.map((school) => school.name).join(", ")}</p>
      <p>{workspace.failed.join(", ")}</p>
      <button onClick={workspace.retry}>Retry</button>
    </>
  );
}

beforeEach(() => {
  for (const read of Object.values(api)) read.mockResolvedValue([]);
  api.results.mockResolvedValue({ schools: [], canReadOwn: false });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("workspace navigation data", () => {
  it("keeps allowed areas available when another module fails and supports retry", async () => {
    api.people.mockResolvedValue([{ id: "school-a", name: "School A" }]);
    api.finance.mockRejectedValueOnce(new Error("Unavailable"));
    render(
      <WorkspaceProvider>
        <WorkspaceProbe />
      </WorkspaceProvider>,
    );
    expect(screen.getByText("Loading")).toBeTruthy();
    await screen.findByText("Ready");
    expect(screen.getByText("School A")).toBeTruthy();
    expect(screen.getByText("finance")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByText("finance")).toBeNull());
    expect(api.people).toHaveBeenCalledWith();
    expect(api.finance).toHaveBeenCalledTimes(2);
  });
});
