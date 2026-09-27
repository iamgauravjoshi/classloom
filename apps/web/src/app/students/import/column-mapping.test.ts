import { describe, expect, it } from "vitest";
import { inferStudentMapping, validateStudentMapping } from "./column-mapping";

describe("student CSV column mapping", () => {
  const headers = ["studentCode", "studentGivenName", "studentFamilyName", "dateOfBirth", "admissionNumber", "sessionCode", "classCode", "sectionCode", "guardianCode", "guardianGivenName", "guardianFamilyName", "relationshipType"];
  it("infers exact or normalized field names", () => {
    expect(inferStudentMapping(headers)).toMatchObject({ studentCode: "studentCode", guardianFamilyName: "guardianFamilyName" });
    expect(inferStudentMapping(["Student Code"])).toMatchObject({ studentCode: "Student Code" });
  });
  it("requires matching guardian identity fields when any guardian field is mapped", () => {
    const mapping = inferStudentMapping(headers);
    expect(validateStudentMapping(headers, mapping)).toEqual([]);
    expect(validateStudentMapping(headers, { ...mapping, guardianFamilyName: undefined })).toContain("Map Guardian family name when guardian columns are present");
  });
  it("rejects duplicate source column choices", () => {
    const mapping = { ...inferStudentMapping(headers), studentGivenName: "studentCode" };
    expect(validateStudentMapping(headers, mapping)).toContain("Use each CSV column only once");
  });
});
