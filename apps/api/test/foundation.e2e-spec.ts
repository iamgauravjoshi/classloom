import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('API foundation', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns health with a request ID and database state', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.body).toMatchObject({
      status: expect.stringMatching(/^(ok|degraded)$/),
      database: expect.stringMatching(/^(up|down)$/),
      requestId: response.headers['x-request-id'],
      timestamp: expect.any(String),
    });
  });

  it('returns a stable error envelope for an unknown route', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/missing');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      code: 'NOT_FOUND',
      message: expect.any(String),
      details: {},
      requestId: expect.any(String),
    });
    expect(response.body.requestId).toBe(response.headers['x-request-id']);
  });
});
