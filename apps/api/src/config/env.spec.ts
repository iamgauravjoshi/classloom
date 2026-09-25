import { parseEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgresql://classloom:secret@localhost:5432/classloom',
  API_PORT: '4000',
  WEB_ORIGIN: 'http://localhost:3000',
};

describe('parseEnv', () => {
  it('accepts a complete development configuration', () => {
    expect(parseEnv(valid)).toEqual({
      databaseUrl: valid.DATABASE_URL,
      apiPort: 4000,
      webOrigin: valid.WEB_ORIGIN,
    });
  });

  it('rejects a missing database URL', () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it('rejects an out-of-range port', () => {
    expect(() => parseEnv({ ...valid, API_PORT: '70000' })).toThrow(/API_PORT/);
  });
});
