import { Global, Module } from '@nestjs/common';
import { createDb } from '@classloom/db';
import { parseRuntimeEnv } from '../config/env.js';
import { DatabaseService } from './database.service.js';

@Global()
@Module({
  providers: [{
    provide: DatabaseService,
    useFactory: () => {
      return new DatabaseService(createDb(parseRuntimeEnv().databaseUrl));
    },
  }],
  exports: [DatabaseService],
})
export class DatabaseModule {}
