import type {
  CalculatedReport,
  GradingPolicyInput,
  ReportSnapshot,
  ResultAssessment,
  ResultCalculationSource,
  ResultTotals,
} from '@classloom/db';
import { BadRequestException } from '@nestjs/common';

export function validateGradingPolicy(
  input: GradingPolicyInput,
): GradingPolicyInput {
  const name = input.name.trim();
  if (!name || name.length > 120)
    throw new BadRequestException(
      'Enter a grading policy name up to 120 characters',
    );
  if (
    !Number.isInteger(input.overallPassingPercentage) ||
    input.overallPassingPercentage < 0 ||
    input.overallPassingPercentage > 10000
  )
    throw new BadRequestException(
      'Overall passing percentage must be between 0 and 100, with at most two decimal places',
    );
  if (input.bands.length < 2 || input.bands.length > 20)
    throw new BadRequestException('Add between 2 and 20 grade bands');
  const bands = input.bands
    .map((band) => ({ ...band, grade: band.grade.trim() }))
    .sort((a, b) => b.minimumPercentage - a.minimumPercentage);
  if (
    bands.some(
      (b) =>
        !b.grade ||
        b.grade.length > 24 ||
        Array.from(b.grade).some((character) => character.charCodeAt(0) < 32) ||
        !Number.isInteger(b.minimumPercentage) ||
        b.minimumPercentage < 0 ||
        b.minimumPercentage > 10000,
    )
  )
    throw new BadRequestException(
      'Each grade needs a label up to 24 characters and a minimum percentage between 0 and 100',
    );
  if (
    new Set(bands.map((b) => b.grade.toLowerCase())).size !== bands.length ||
    new Set(bands.map((b) => b.minimumPercentage)).size !== bands.length
  )
    throw new BadRequestException(
      'Grade labels and minimum percentages must be distinct',
    );
  if (bands.at(-1)?.minimumPercentage !== 0)
    throw new BadRequestException(
      'The lowest grade band must start at 0 percent',
    );
  return { ...input, name, bands };
}

function percentage(earned: number, maximum: number) {
  return maximum ? Number((BigInt(earned) * 10000n) / BigInt(maximum)) : null;
}
function grade(
  earned: number,
  maximum: number,
  policy: ReportSnapshot['policy'],
) {
  return maximum
    ? (policy.bands.find(
        (b) =>
          BigInt(earned) * 10000n >=
          BigInt(maximum) * BigInt(b.minimumPercentage),
      )?.grade ?? null)
    : null;
}

export function calculateReports(
  source: ResultCalculationSource,
  policy: ReportSnapshot['policy'],
): CalculatedReport[] {
  policy = {
    id: policy.id,
    name: policy.name,
    revision: policy.revision,
    bands: policy.bands,
    overallPassingPercentage: policy.overallPassingPercentage,
    requireSubjectPass: policy.requireSubjectPass,
  };
  if (!source.assessments.length)
    throw new BadRequestException(
      'The completed examination has no assessments',
    );
  const sections = new Map<string, typeof source.assessments>();
  for (const assessment of source.assessments) {
    const rows = sections.get(assessment.sectionId) ?? [];
    rows.push(assessment);
    sections.set(assessment.sectionId, rows);
  }
  const reports: CalculatedReport[] = [];
  for (const [sectionId, assessments] of sections) {
    const students = new Map<
      string,
      ResultCalculationSource['assessments'][number]['marks'][number]
    >();
    for (const assessment of assessments)
      for (const mark of assessment.marks) students.set(mark.studentId, mark);
    for (const [studentId, student] of students) {
      const subjects = new Map<
        string,
        { name: string; assessments: ResultAssessment[] }
      >();
      for (const assessment of assessments) {
        const subject = subjects.get(assessment.subjectId) ?? {
          name: assessment.subjectName,
          assessments: [],
        };
        const mark = assessment.marks.find((m) => m.studentId === studentId);
        if (
          mark &&
          (mark.status === 'scored'
            ? !Number.isInteger(mark.score) ||
              mark.score === null ||
              mark.score < 0 ||
              mark.score > assessment.maximumScore
            : mark.score !== null)
        )
          throw new BadRequestException(
            'The reviewed marks contain an invalid outcome',
          );
        subject.assessments.push({
          id: assessment.id,
          label: assessment.label,
          date: assessment.assessmentDate,
          maximumScore: assessment.maximumScore,
          passingScore: assessment.passingScore,
          status: mark?.status ?? 'not_assessed',
          score: mark?.score ?? null,
        });
        subjects.set(assessment.subjectId, subject);
      }
      const subjectResults: ReportSnapshot['subjects'] = [...subjects]
        .map(([subjectId, subject]) => {
          const included = subject.assessments.filter(
            (a) => a.status === 'scored' || a.status === 'absent',
          );
          const earnedScore = included.reduce(
              (sum, a) => sum + (a.score ?? 0),
              0,
            ),
            maximumScore = included.reduce((sum, a) => sum + a.maximumScore, 0),
            passingScore = included.reduce((sum, a) => sum + a.passingScore, 0);
          const incomplete = subject.assessments.some(
            (a) => a.status === 'not_assessed',
          );
          const outcome: ResultTotals['outcome'] = incomplete
            ? 'incomplete'
            : !maximumScore
              ? 'exempt'
              : included.some((a) => a.status === 'absent') ||
                  earnedScore < passingScore
                ? 'failed'
                : 'passed';
          return {
            subjectId,
            name: subject.name,
            assessments: subject.assessments,
            earnedScore,
            maximumScore,
            passingScore,
            percentage: incomplete
              ? null
              : percentage(earnedScore, maximumScore),
            grade: incomplete ? null : grade(earnedScore, maximumScore, policy),
            outcome,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      const earnedScore = subjectResults.reduce(
          (sum, s) => sum + s.earnedScore,
          0,
        ),
        maximumScore = subjectResults.reduce(
          (sum, s) => sum + s.maximumScore,
          0,
        );
      const incomplete = subjectResults.some((s) => s.outcome === 'incomplete'),
        absent = subjectResults.some((s) =>
          s.assessments.some((a) => a.status === 'absent'),
        );
      const meetsThreshold =
        maximumScore > 0 &&
        BigInt(earnedScore) * 10000n >=
          BigInt(maximumScore) * BigInt(policy.overallPassingPercentage);
      const overall: ResultTotals = {
        earnedScore,
        maximumScore,
        percentage: incomplete ? null : percentage(earnedScore, maximumScore),
        grade: incomplete ? null : grade(earnedScore, maximumScore, policy),
        outcome: incomplete
          ? 'incomplete'
          : !maximumScore
            ? 'exempt'
            : meetsThreshold &&
                !absent &&
                (!policy.requireSubjectPass ||
                  subjectResults.every((s) => s.outcome !== 'failed'))
              ? 'passed'
              : 'failed',
      };
      reports.push({
        sectionId,
        studentId,
        schoolEnrollmentId: student.schoolEnrollmentId,
        snapshot: {
          school: source.school,
          exam: source.exam,
          sessionName: source.sessionName,
          className: source.className,
          sectionName: assessments[0].sectionName,
          student: student.identity,
          policy,
          subjects: subjectResults,
          overall,
        },
      });
    }
  }
  return reports.sort(
    (a, b) =>
      a.snapshot.sectionName.localeCompare(b.snapshot.sectionName) ||
      a.snapshot.student.name.localeCompare(b.snapshot.student.name) ||
      a.studentId.localeCompare(b.studentId),
  );
}
