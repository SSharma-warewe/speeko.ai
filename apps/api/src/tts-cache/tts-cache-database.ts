import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type QueryRunner } from 'typeorm';

/** Separate, lazily connected pool. Cache traffic cannot queue on the domain pool. */
@Injectable()
export class TtsCacheDatabase implements OnModuleDestroy {
  private readonly db: DataSource;
  private initialization?: Promise<DataSource>;
  private active = 0;
  private closing = false;
  readonly stats = {
    unavailable: 0,
    lastFailurePhase: '',
    lastFailureCode: '',
  };
  constructor(@InjectDataSource() primary: DataSource) {
    this.db = new DataSource({
      ...primary.options,
      entities: [],
      subscribers: [],
      migrations: [],
      synchronize: false,
      dropSchema: false,
      logging: false,
      extra: {
        ...primary.options.extra,
        max: 2,
        connectionTimeoutMillis: 100,
        statement_timeout: 150,
        query_timeout: 200,
        idle_in_transaction_session_timeout: 500,
        application_name: 'speeko_tts_cache',
      },
    });
  }
  async run<T>(
    write: boolean,
    action: (runner: QueryRunner) => Promise<T>,
  ): Promise<T | undefined> {
    if (this.closing || this.active >= 2) {
      this.stats.unavailable++;
      return;
    }
    this.active++;
    let runner: QueryRunner | undefined;
    let originalQuery: QueryRunner['query'] | undefined;
    let phase = 'initialize';
    try {
      if (!this.db.isInitialized) {
        this.initialization ??= this.db.initialize().finally(() => {
          this.initialization = undefined;
        });
        await this.initialization;
      }
      if (this.closing) return;
      phase = 'connect';
      runner = this.db.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      phase = 'configure';
      await runner.query(
        `SET LOCAL statement_timeout = '${write ? 150 : 15}ms'`,
      );
      await runner.query("SET LOCAL lock_timeout = '10ms'");
      const deadline = performance.now() + (write ? 180 : 20);
      phase = 'operation';
      const original = runner.query.bind(runner);
      originalQuery = original;
      runner.query = ((...args: Parameters<QueryRunner['query']>) => {
        if (performance.now() > deadline)
          throw new Error('Cache operation deadline exceeded');
        return original(...args);
      }) as QueryRunner['query'];
      const result = await action(runner);
      // Restore query for rollback/commit even when the operation budget has elapsed.
      runner.query = original;
      if (performance.now() > deadline)
        throw new Error('Cache operation deadline exceeded');
      await runner.commitTransaction();
      return result;
    } catch (error) {
      this.stats.unavailable++;
      this.stats.lastFailurePhase = phase;
      const code = (error as { code?: unknown })?.code;
      this.stats.lastFailureCode =
        typeof code === 'string' && /^[A-Z0-9]{5}$/.test(code)
          ? code
          : 'cache_error';
      if (runner?.isTransactionActive) {
        // Deadline wrappers must never prevent rollback.
        if (originalQuery) runner.query = originalQuery;
        try {
          await runner.rollbackTransaction();
        } catch {
          /* connection may have been lost */
        }
      }
      return;
    } finally {
      if (runner) await runner.release().catch(() => {});
      this.active--;
    }
  }
  async onModuleDestroy() {
    this.closing = true;
    await this.initialization?.catch(() => {});
    if (this.db.isInitialized) await this.db.destroy();
  }
}
