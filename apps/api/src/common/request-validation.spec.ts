import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseRequest } from './request-validation.js';

describe('request validation errors', () => {
  it('identifies a nested field instead of only the form section', () => {
    const schema = z.object({ student: z.object({ givenName: z.string().min(2) }) });
    try { parseRequest(schema, { student: { givenName: 'A' } }); }
    catch (error) {
      expect(error).toMatchObject({ response: { details: { fields: { 'student.givenName': expect.any(String) } } } });
      return;
    }
    throw new Error('Expected validation to fail');
  });
});
