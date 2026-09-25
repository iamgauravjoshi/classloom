import { Controller, Get, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { checkDatabase } from '@classloom/db';
import type { Request } from 'express';

type RequestWithId = Request & { requestId: string };

@Controller('health')
@ApiTags('Health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Process liveness and database readiness' })
  async getHealth(@Req() request: RequestWithId) {
    const database = process.env.DATABASE_URL && await checkDatabase(process.env.DATABASE_URL) ? 'up' : 'down';
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      requestId: request.requestId,
      timestamp: new Date().toISOString(),
    };
  }
}
