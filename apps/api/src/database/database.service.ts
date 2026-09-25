import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { createDb } from '@classloom/db';

type DatabaseClient = ReturnType<typeof createDb>;

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  readonly db: DatabaseClient['db'];

  constructor(private readonly client: DatabaseClient) {
    this.db = client.db;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client.close();
  }
}
