import { describe, expect, it } from 'vitest';
import type {
  GradingPolicyInput,
  ReportSnapshot,
  ResultCalculationSource,
} from '@classloom/db';
import {
  calculateReports,
  validateGradingPolicy,
} from './result-calculator.js';

const input: GradingPolicyInput = {
  name: '2026 grading',
  bands: [
    { grade: 'A', minimumPercentage: 8000 },
    { grade: 'B', minimumPercentage: 6000 },
    { grade: 'F', minimumPercentage: 0 },
  ],
  overallPassingPercentage: 3500,
  requireSubjectPass: true,
  idempotencyKey: 'key',
};
const policy: ReportSnapshot['policy'] = {
  ...input,
  id: 'policy',
  revision: 1,
};
function source(
  score: number | null = 8000,
  status: 'scored' | 'absent' | 'exempt' = 'scored',
): ResultCalculationSource {
  return {
    school: { name: 'School', code: 'S', timezone: 'UTC' },
    exam: {
      id: 'exam',
      name: 'Term',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    },
    sessionName: '2026',
    className: 'Grade 1',
    assessments: [
      {
        id: 'paper',
        sectionId: 'section',
        sectionName: 'A',
        subjectId: 'subject',
        subjectName: 'English',
        label: 'Written',
        assessmentDate: '2026-09-15',
        maximumScore: 10000,
        passingScore: 3500,
        marks: [
          {
            studentId: 'student',
            schoolEnrollmentId: 'admission',
            identity: {
              id: 'student',
              code: 'S1',
              name: 'Asha Rao',
              dateOfBirth: '2018-03-04',
              admissionNumber: 'A1',
              rollNumber: '1',
            },
            status,
            score,
          },
        ],
      },
    ],
  };
}
describe('exact result calculation', () => {
  it('validates complete grade bands and preserves named immutable policy input', () => {
    expect(
      validateGradingPolicy({ ...input, bands: [...input.bands].reverse() })
        .bands,
    ).toEqual(input.bands);
    expect(() =>
      validateGradingPolicy({ ...input, bands: input.bands.slice(0, 2) }),
    ).toThrow('0 percent');
    expect(() =>
      validateGradingPolicy({
        ...input,
        bands: [
          { grade: 'A', minimumPercentage: 8000 },
          { grade: 'a', minimumPercentage: 0 },
        ],
      }),
    ).toThrow('distinct');
    expect(() =>
      validateGradingPolicy({ ...input, overallPassingPercentage: 10001 }),
    ).toThrow('passing percentage');
  });
  it('does not round a mark across a grading boundary and preserves valid zero', () => {
    expect(
      calculateReports(source(7999), policy)[0].snapshot.overall,
    ).toMatchObject({ percentage: 7999, grade: 'B', outcome: 'passed' });
    expect(
      calculateReports(source(8000), policy)[0].snapshot.overall.grade,
    ).toBe('A');
    expect(
      calculateReports(source(0), policy)[0].snapshot.overall,
    ).toMatchObject({ earnedScore: 0, percentage: 0, outcome: 'failed' });
    const fractional = source(1);
    fractional.assessments[0].maximumScore = 3;
    fractional.assessments[0].passingScore = 0;
    expect(
      calculateReports(fractional, policy)[0].snapshot.overall.percentage,
    ).toBe(3333);
  });
  it('treats absence and exemption explicitly rather than fabricating scored marks', () => {
    expect(
      calculateReports(source(null, 'absent'), {
        ...policy,
        overallPassingPercentage: 0,
        requireSubjectPass: false,
      })[0].snapshot.overall,
    ).toMatchObject({ maximumScore: 10000, outcome: 'failed' });
    expect(
      calculateReports(source(null, 'exempt'), policy)[0].snapshot.overall,
    ).toEqual({
      earnedScore: 0,
      maximumScore: 0,
      percentage: null,
      grade: null,
      outcome: 'exempt',
    });
  });
  it('aggregates papers and excludes exemptions from subject thresholds', () => {
    const value = source(4000);
    value.assessments[0].maximumScore = 5000;
    const second = structuredClone(value.assessments[0]);
    second.id = 'oral';
    second.marks[0].score = 3000;
    second.passingScore = 1500;
    value.assessments.push(second);
    expect(
      calculateReports(value, policy)[0].snapshot.subjects[0],
    ).toMatchObject({
      earnedScore: 7000,
      maximumScore: 10000,
      passingScore: 5000,
      outcome: 'passed',
    });
    second.marks[0] = { ...second.marks[0], status: 'exempt', score: null };
    expect(calculateReports(value, policy)[0].snapshot.overall).toMatchObject({
      earnedScore: 4000,
      maximumScore: 5000,
      percentage: 8000,
      grade: 'A',
    });
  });
  it('retains incomplete roster coverage without awarding an overall grade or pass', () => {
    const value = source();
    value.assessments.push({
      ...structuredClone(value.assessments[0]),
      id: 'missing',
      marks: [],
    });
    const report = calculateReports(value, policy)[0].snapshot;
    expect(report.subjects[0].assessments[1].status).toBe('not_assessed');
    expect(report.overall).toMatchObject({
      outcome: 'incomplete',
      percentage: null,
      grade: null,
    });
    expect(value.assessments[1].marks).toHaveLength(0);
  });
  it('rejects invalid reviewed scores and keeps reports separate by section', () => {
    expect(() => calculateReports(source(10001), policy)).toThrow(
      'invalid outcome',
    );
    const value = source();
    value.assessments.push({
      ...structuredClone(value.assessments[0]),
      id: 'transfer',
      sectionId: 'other',
      sectionName: 'B',
    });
    expect(calculateReports(value, policy).map((r) => r.sectionId)).toEqual([
      'section',
      'other',
    ]);
  });
});
