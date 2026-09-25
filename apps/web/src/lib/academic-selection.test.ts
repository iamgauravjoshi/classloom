import { describe, expect, it } from "vitest";
import { switchAcademicSession } from "./academic-selection";

describe("academic setup selection", () => {
  it("clears class, section and subject choices when switching sessions", () => {
    expect(switchAcademicSession("session-b")).toEqual({ sessionId: "session-b", classId: "", sectionId: "", subjectId: "", membershipId: "" });
  });
});
