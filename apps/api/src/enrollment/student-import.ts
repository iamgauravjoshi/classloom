import { parse } from 'csv-parse/sync';

export const STUDENT_CSV_MAX_BYTES = 2 * 1024 * 1024;
export const STUDENT_CSV_MAX_ROWS = 1000;

export type StudentCsvField =
  | 'studentCode' | 'studentGivenName' | 'studentMiddleName' | 'studentFamilyName' | 'studentPreferredName'
  | 'dateOfBirth' | 'studentGender' | 'studentEmail' | 'studentPhone'
  | 'admissionNumber' | 'sessionCode' | 'classCode' | 'sectionCode' | 'rollNumber'
  | 'guardianCode' | 'guardianGivenName' | 'guardianMiddleName' | 'guardianFamilyName' | 'guardianPreferredName'
  | 'guardianEmail' | 'guardianPhone' | 'guardianOccupation' | 'guardianAddressLine1' | 'guardianAddressLine2'
  | 'guardianCity' | 'guardianState' | 'guardianPostalCode' | 'guardianCountryCode' | 'relationshipType';

export const STUDENT_CSV_FIELDS: readonly StudentCsvField[] = [
  'studentCode', 'studentGivenName', 'studentMiddleName', 'studentFamilyName', 'studentPreferredName',
  'dateOfBirth', 'studentGender', 'studentEmail', 'studentPhone', 'admissionNumber',
  'sessionCode', 'classCode', 'sectionCode', 'rollNumber', 'guardianCode', 'guardianGivenName',
  'guardianMiddleName', 'guardianFamilyName', 'guardianPreferredName', 'guardianEmail',
  'guardianPhone', 'guardianOccupation', 'guardianAddressLine1', 'guardianAddressLine2',
  'guardianCity', 'guardianState', 'guardianPostalCode', 'guardianCountryCode', 'relationshipType',
];

export type StudentCsvMapping = Partial<Record<StudentCsvField, string>> & Pick<Record<StudentCsvField, string>,
  'studentCode' | 'studentGivenName' | 'studentFamilyName' | 'dateOfBirth' | 'admissionNumber' | 'sessionCode' | 'classCode' | 'sectionCode'>;

export type StudentImportPreviewError = { row: number; field: StudentCsvField | 'file' | 'mapping'; message: string };
export type StudentImportGuardianCommand = {
  providedFields: string[];
  guardian: {
    guardianCode: string; givenName: string; middleName: string | null; familyName: string; preferredName: string | null;
    email: string | null; phone: string | null; occupation: string | null; addressLine1: string | null; addressLine2: string | null;
    city: string | null; state: string | null; postalCode: string | null; countryCode: string | null;
  };
  relationship: { relationshipType: 'mother' | 'father' | 'legal_guardian' | 'grandparent' | 'sibling' | 'other' };
};
export type StudentImportCommand = {
  sourceRows: number[];
  providedFields: string[];
  student: {
    studentCode: string; givenName: string; middleName: string | null; familyName: string; preferredName: string | null;
    dateOfBirth: string; gender: string | null; email: string | null; phone: string | null;
  };
  schoolEnrollment: { admissionNumber: string };
  placement: { sessionCode: string; classCode: string; sectionCode: string; rollNumber: string | null };
  guardians: StudentImportGuardianCommand[];
};

export class StudentImportFileError extends Error {
  constructor(message: string) { super(message); this.name = 'StudentImportFileError'; }
}

function decode(buffer: Buffer): string {
  if (!buffer.length) throw new StudentImportFileError('The CSV file is empty');
  if (buffer.length > STUDENT_CSV_MAX_BYTES) throw new StudentImportFileError('The CSV file must be 2 MiB or smaller');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, ''); }
  catch { throw new StudentImportFileError('The CSV file must use valid UTF-8 encoding'); }
}

function rowsFrom(buffer: Buffer): string[][] {
  const text = decode(buffer);
  let rows: string[][];
  try {
    rows = parse(text, { delimiter: ',', bom: true, relax_column_count: false, skip_empty_lines: true }) as string[][];
  } catch {
    throw new StudentImportFileError('Every CSV row must have the same column count and valid quoting');
  }
  if (!rows.length || !rows[0]?.length) throw new StudentImportFileError('The CSV file is empty');
  if (rows.length < 2) throw new StudentImportFileError('The CSV file needs at least one data row');
  const headers = rows[0].map((header) => header.trim());
  if (headers.some((header) => !header)) throw new StudentImportFileError('The CSV contains a blank header');
  const normalized = headers.map((header) => header.toLowerCase());
  if (new Set(normalized).size !== normalized.length) throw new StudentImportFileError('The CSV contains a duplicate header');
  if (rows.slice(1).some((row) => row.length !== headers.length)) throw new StudentImportFileError('Every CSV row must have the same column count');
  if (rows.length - 1 > STUDENT_CSV_MAX_ROWS) throw new StudentImportFileError('The CSV cannot contain more than 1,000 data rows');
  return [headers, ...rows.slice(1)];
}

export function inspectStudentCsv(buffer: Buffer) {
  const [headers = [], ...rows] = rowsFrom(buffer);
  return {
    headers,
    rowCount: rows.length,
    sampleRows: rows.slice(0, 5).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))),
  };
}

const requiredFields: StudentCsvField[] = [
  'studentCode', 'studentGivenName', 'studentFamilyName', 'dateOfBirth', 'admissionNumber', 'sessionCode', 'classCode', 'sectionCode',
];
const guardianRequiredFields: StudentCsvField[] = ['guardianCode', 'guardianGivenName', 'guardianFamilyName', 'relationshipType'];
const guardianFields: StudentCsvField[] = [
  'guardianCode', 'guardianGivenName', 'guardianMiddleName', 'guardianFamilyName', 'guardianPreferredName', 'guardianEmail', 'guardianPhone',
  'guardianOccupation', 'guardianAddressLine1', 'guardianAddressLine2', 'guardianCity', 'guardianState', 'guardianPostalCode', 'guardianCountryCode', 'relationshipType',
];

function validateMapping(headers: string[], mapping: StudentCsvMapping) {
  for (const field of requiredFields) {
    if (!mapping[field]) throw new StudentImportFileError(`Mapping for ${field} is required`);
  }
  const mapped = Object.values(mapping).filter((value): value is string => Boolean(value));
  for (const field of Object.keys(mapping)) {
    if (!STUDENT_CSV_FIELDS.includes(field as StudentCsvField)) throw new StudentImportFileError(`Unknown mapping field “${field}”`);
  }
  if (new Set(mapped).size !== mapped.length) throw new StudentImportFileError('A CSV header cannot be mapped more than once');
  for (const header of mapped) if (!headers.includes(header)) throw new StudentImportFileError(`Mapped header “${header}” was not found`);
}

function optional(value: string | undefined, field: StudentCsvField, row: number, errors: StudentImportPreviewError[], maximum = 240): string | null {
  const normalized = value?.trim() || null;
  if (normalized && normalized.length > maximum) errors.push({ row, field, message: `Must be at most ${maximum} characters` });
  return normalized;
}

function code(value: string, field: StudentCsvField, row: number, errors: StudentImportPreviewError[], maximum = 40) {
  const normalized = value.trim().toUpperCase();
  if (!new RegExp(`^[A-Z0-9][A-Z0-9/_-]{0,${maximum - 1}}$`).test(normalized)) errors.push({ row, field, message: 'Use letters, numbers, slashes, hyphens, or underscores' });
  return normalized;
}

function name(value: string, field: StudentCsvField, row: number, errors: StudentImportPreviewError[]) {
  const normalized = value.trim();
  if (normalized.length < 2 || normalized.length > 120) errors.push({ row, field, message: 'Must be 2–120 characters' });
  return normalized;
}

function date(value: string, field: StudentCsvField, row: number, errors: StudentImportPreviewError[]) {
  const normalized = value.trim();
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== normalized) {
    errors.push({ row, field, message: 'Must be a valid date in YYYY-MM-DD format' });
  }
  if (field === 'dateOfBirth' && /^\d{4}-\d{2}-\d{2}$/.test(normalized) && normalized > new Date().toISOString().slice(0, 10)) {
    errors.push({ row, field, message: 'Date of birth cannot be in the future' });
  }
  return normalized;
}

function firstDifferent(a: Record<string, unknown>, b: Record<string, unknown>): string | null {
  return Object.keys(a).find((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key])) ?? null;
}

export function previewStudentCsv(buffer: Buffer, mapping: StudentCsvMapping) {
  const [headers = [], ...rows] = rowsFrom(buffer);
  validateMapping(headers, mapping);
  const indexes = new Map(headers.map((header, index) => [header, index]));
  const value = (row: string[], field: StudentCsvField) => {
    const header = mapping[field];
    return header ? row[indexes.get(header)!] ?? '' : '';
  };
  const errors: StudentImportPreviewError[] = [];
  const commands = new Map<string, StudentImportCommand>();
  const guardians = new Map<string, StudentImportGuardianCommand['guardian']>();

  rows.forEach((cells, index) => {
    const row = index + 2;
    const studentCode = code(value(cells, 'studentCode'), 'studentCode', row, errors, 20);
    const student = {
      studentCode,
      givenName: name(value(cells, 'studentGivenName'), 'studentGivenName', row, errors),
      middleName: optional(value(cells, 'studentMiddleName'), 'studentMiddleName', row, errors, 120),
      familyName: name(value(cells, 'studentFamilyName'), 'studentFamilyName', row, errors),
      preferredName: optional(value(cells, 'studentPreferredName'), 'studentPreferredName', row, errors, 120),
      dateOfBirth: date(value(cells, 'dateOfBirth'), 'dateOfBirth', row, errors),
      gender: optional(value(cells, 'studentGender'), 'studentGender', row, errors, 50),
      email: optional(value(cells, 'studentEmail'), 'studentEmail', row, errors, 254)?.toLowerCase() ?? null,
      phone: optional(value(cells, 'studentPhone'), 'studentPhone', row, errors, 30),
    };
    const schoolEnrollment = {
      admissionNumber: code(value(cells, 'admissionNumber'), 'admissionNumber', row, errors),
    };
    const placement = {
      sessionCode: code(value(cells, 'sessionCode'), 'sessionCode', row, errors, 20),
      classCode: code(value(cells, 'classCode'), 'classCode', row, errors, 20),
      sectionCode: code(value(cells, 'sectionCode'), 'sectionCode', row, errors, 20),
      rollNumber: value(cells, 'rollNumber').trim() ? code(value(cells, 'rollNumber'), 'rollNumber', row, errors) : null,
    };
    const command: StudentImportCommand = {
      sourceRows: [row],
      providedFields: Object.keys(mapping).filter((field) => field.startsWith('student') || field === 'dateOfBirth'),
      student, schoolEnrollment, placement, guardians: [],
    };

    const hasGuardian = guardianFields.some((field) => value(cells, field).trim());
    if (hasGuardian) {
      for (const field of guardianRequiredFields) if (!value(cells, field).trim()) errors.push({ row, field, message: 'Required when guardian data is present' });
      const guardianCode = code(value(cells, 'guardianCode'), 'guardianCode', row, errors, 20);
      const guardian = {
        guardianCode,
        givenName: name(value(cells, 'guardianGivenName'), 'guardianGivenName', row, errors),
        middleName: optional(value(cells, 'guardianMiddleName'), 'guardianMiddleName', row, errors, 120),
        familyName: name(value(cells, 'guardianFamilyName'), 'guardianFamilyName', row, errors),
        preferredName: optional(value(cells, 'guardianPreferredName'), 'guardianPreferredName', row, errors, 120),
        email: optional(value(cells, 'guardianEmail'), 'guardianEmail', row, errors, 254)?.toLowerCase() ?? null,
        phone: optional(value(cells, 'guardianPhone'), 'guardianPhone', row, errors, 30),
        occupation: optional(value(cells, 'guardianOccupation'), 'guardianOccupation', row, errors, 120),
        addressLine1: optional(value(cells, 'guardianAddressLine1'), 'guardianAddressLine1', row, errors),
        addressLine2: optional(value(cells, 'guardianAddressLine2'), 'guardianAddressLine2', row, errors),
        city: optional(value(cells, 'guardianCity'), 'guardianCity', row, errors, 120),
        state: optional(value(cells, 'guardianState'), 'guardianState', row, errors, 120),
        postalCode: optional(value(cells, 'guardianPostalCode'), 'guardianPostalCode', row, errors, 30),
        countryCode: optional(value(cells, 'guardianCountryCode'), 'guardianCountryCode', row, errors, 2)?.toUpperCase() ?? null,
      };
      const relationshipValue = value(cells, 'relationshipType').trim().toLowerCase().replace(/[ -]+/g, '_');
      const relationshipTypes = new Set(['mother', 'father', 'legal_guardian', 'grandparent', 'sibling', 'other']);
      if (!relationshipTypes.has(relationshipValue)) errors.push({ row, field: 'relationshipType', message: 'Choose a valid guardian relationship' });
      const existingGuardian = guardians.get(guardianCode);
      if (existingGuardian) {
        const changed = firstDifferent(existingGuardian, guardian);
        if (changed) {
          const field = `guardian${changed[0]!.toUpperCase()}${changed.slice(1)}` as StudentCsvField;
          errors.push({ row, field, message: 'Guardian details conflict with an earlier row using this code' });
        }
      } else guardians.set(guardianCode, guardian);
      command.guardians.push({
        providedFields: Object.keys(mapping).filter((field) => field.startsWith('guardian')),
        guardian,
        relationship: { relationshipType: relationshipValue as StudentImportGuardianCommand['relationship']['relationshipType'] },
      });
    }

    const existing = commands.get(studentCode);
    if (existing) {
      const changedStudent = firstDifferent(existing.student, student);
      const changedSchool = firstDifferent(existing.schoolEnrollment, schoolEnrollment);
      const changedPlacement = firstDifferent(existing.placement, placement);
      if (changedStudent || changedSchool || changedPlacement) {
        const source = changedStudent ? 'student' : changedSchool ? 'school' : 'placement';
        const changed = changedStudent ?? changedSchool ?? changedPlacement!;
        const field = source === 'student'
          ? (changed === 'dateOfBirth' ? 'dateOfBirth' : `student${changed[0]!.toUpperCase()}${changed.slice(1)}`.replace('studentStudentCode', 'studentCode') as StudentCsvField)
          : source === 'school' ? changed as StudentCsvField : changed as StudentCsvField;
        errors.push({ row, field, message: 'Student details conflict with an earlier row using this code' });
      } else {
        existing.sourceRows.push(row);
        existing.guardians.push(...command.guardians);
      }
    } else commands.set(studentCode, command);
  });

  return { rowCount: rows.length, commands: [...commands.values()], errors };
}
