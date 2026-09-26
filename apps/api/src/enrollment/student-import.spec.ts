import { describe, expect, it } from 'vitest';
import { inspectStudentCsv, previewStudentCsv, type StudentCsvMapping } from './student-import.js';

const mapping: StudentCsvMapping = {
  studentCode: 'Student Code', studentGivenName: 'First Name', studentFamilyName: 'Last Name', dateOfBirth: 'DOB',
  admissionNumber: 'Admission', sessionCode: 'Session', classCode: 'Class', sectionCode: 'Section',
  guardianCode: 'Guardian Code', guardianGivenName: 'Guardian First', guardianFamilyName: 'Guardian Last', relationshipType: 'Relationship',
};

const header = 'Student Code,First Name,Last Name,DOB,Admission,Session,Class,Section,Guardian Code,Guardian First,Guardian Last,Relationship,Notes';

describe('student CSV inspection and preview', () => {
  it('handles a UTF-8 BOM and quoted commas and newlines', () => {
    const csv = `\uFEFF${header}\nS-1,Asha,Rao,2013-08-14,ADM-1,2026,G8,A,G-1,Ravi,Rao,Father,"Needs, support\nand follow-up"`;
    const inspected = inspectStudentCsv(Buffer.from(csv));
    expect(inspected.headers[0]).toBe('Student Code');
    expect(inspected.sampleRows[0]!.Notes).toBe('Needs, support\nand follow-up');
    expect(previewStudentCsv(Buffer.from(csv), mapping)).toMatchObject({ rowCount: 1, errors: [], commands: [{ student: { studentCode: 'S-1' } }] });
  });

  it('rejects empty, invalid UTF-8, blank, duplicate, and ragged headers', () => {
    expect(() => inspectStudentCsv(Buffer.alloc(0))).toThrow(/empty/i);
    expect(() => previewStudentCsv(Buffer.from(header), mapping)).toThrow(/at least one data row/i);
    expect(() => inspectStudentCsv(Buffer.from([0xc3, 0x28]))).toThrow(/UTF-8/i);
    expect(() => inspectStudentCsv(Buffer.from('Code,,Name\n1,x,Asha'))).toThrow(/blank header/i);
    expect(() => inspectStudentCsv(Buffer.from('Code, code \n1,2'))).toThrow(/duplicate header/i);
    expect(() => inspectStudentCsv(Buffer.from('Code,Name\n1'))).toThrow(/column count/i);
  });

  it('caps data rows at 1,000', () => {
    const rows = Array.from({ length: 1001 }, (_, index) => `S-${index},Asha,Rao,2013-08-14,ADM-${index},2026,G8,A,,,,,`).join('\n');
    expect(() => previewStudentCsv(Buffer.from(`${header}\n${rows}`), mapping)).toThrow(/1,000/);
  });

  it('reports exact row and field errors and conditional guardian requirements', () => {
    const csv = `${header}\nS-1,X,Rao,not-a-date,ADM-1,2026,G8,A,G-1,,,,note`;
    const result = previewStudentCsv(Buffer.from(csv), mapping);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 2, field: 'studentGivenName' }),
      expect.objectContaining({ row: 2, field: 'dateOfBirth' }),
      expect.objectContaining({ row: 2, field: 'guardianGivenName' }),
      expect.objectContaining({ row: 2, field: 'relationshipType' }),
    ]));
  });

  it('groups repeated students and guardians while rejecting conflicting shared values', () => {
    const csv = `${header}\nS-1,Asha,Rao,2013-08-14,ADM-1,2026,G8,A,G-1,Ravi,Rao,Father,one\nS-1,Asha,Rao,2013-08-14,ADM-1,2026,G8,A,G-2,Nina,Rao,Mother,two\nS-2,Kabir,Rao,2014-01-01,ADM-2,2026,G8,A,G-1,Ravindra,Rao,Father,three`;
    const result = previewStudentCsv(Buffer.from(csv), mapping);
    expect(result.commands).toHaveLength(2);
    expect(result.commands[0]!.guardians).toHaveLength(2);
    expect(result.errors).toEqual([expect.objectContaining({ row: 4, field: 'guardianGivenName', message: expect.stringMatching(/conflict/i) })]);
  });

  it('accepts unmapped columns and rows without guardian data but rejects duplicate mappings', () => {
    const csv = `${header}\nS-1,Asha,Rao,2013-08-14,ADM-1,2026,G8,A,,,,,ignored`;
    expect(previewStudentCsv(Buffer.from(csv), mapping)).toMatchObject({ errors: [], commands: [{ guardians: [] }] });
    expect(() => previewStudentCsv(Buffer.from(csv), { ...mapping, studentFamilyName: 'First Name' })).toThrow(/mapped more than once/i);
    expect(() => previewStudentCsv(Buffer.from(csv), { ...mapping, unknownField: 'Notes' } as StudentCsvMapping)).toThrow(/Unknown mapping field/i);
  });

  it('reports overlong optional values without shortening imported data', () => {
    const extra = 'x'.repeat(31);
    const withPhone = `${header},Student Phone\nS-1,Asha,Rao,2013-08-14,ADM-1,2026,G8,A,,,,,note,${extra}`;
    const result = previewStudentCsv(Buffer.from(withPhone), { ...mapping, studentPhone: 'Student Phone' });
    expect(result.errors).toEqual([expect.objectContaining({ row: 2, field: 'studentPhone', message: expect.stringMatching(/30/) })]);
    expect(result.commands[0]!.student.phone).toBe(extra);
  });
});
