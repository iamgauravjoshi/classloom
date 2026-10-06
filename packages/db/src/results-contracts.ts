export type GradeBand = { grade: string; minimumPercentage: number };
export type GradingPolicyInput = {
  name: string;
  bands: GradeBand[];
  overallPassingPercentage: number;
  requireSubjectPass: boolean;
  idempotencyKey: string;
};
export type ResultOutcome = "passed" | "failed" | "exempt" | "incomplete";
export type ResultAssessmentOutcome =
  "scored" | "absent" | "exempt" | "not_assessed";
export type ResultAssessment = {
  id: string;
  label: string;
  date: string;
  status: ResultAssessmentOutcome;
  score: number | null;
  maximumScore: number;
  passingScore: number;
};
export type ResultTotals = {
  earnedScore: number;
  maximumScore: number;
  percentage: number | null;
  grade: string | null;
  outcome: ResultOutcome;
};
export type ReportSnapshot = {
  school: { name: string; code: string; timezone: string };
  exam: { id: string; name: string; startDate: string; endDate: string };
  sessionName: string;
  className: string;
  sectionName: string;
  student: {
    id: string;
    code: string;
    name: string;
    dateOfBirth: string;
    admissionNumber: string;
    rollNumber: string | null;
  };
  policy: {
    id: string;
    name: string;
    revision: number;
    bands: GradeBand[];
    overallPassingPercentage: number;
    requireSubjectPass: boolean;
  };
  subjects: (ResultTotals & {
    subjectId: string;
    name: string;
    passingScore: number;
    assessments: ResultAssessment[];
  })[];
  overall: ResultTotals;
};
export type CalculatedReport = {
  sectionId: string;
  studentId: string;
  schoolEnrollmentId: string;
  snapshot: ReportSnapshot;
};
export type ResultCalculationSource = {
  school: ReportSnapshot["school"];
  exam: ReportSnapshot["exam"];
  sessionName: string;
  className: string;
  assessments: {
    id: string;
    sectionId: string;
    sectionName: string;
    subjectId: string;
    subjectName: string;
    label: string;
    assessmentDate: string;
    maximumScore: number;
    passingScore: number;
    marks: {
      studentId: string;
      schoolEnrollmentId: string;
      identity: ReportSnapshot["student"];
      status: "scored" | "absent" | "exempt";
      score: number | null;
    }[];
  }[];
};
