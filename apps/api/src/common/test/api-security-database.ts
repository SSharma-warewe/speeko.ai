import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DataSource, getMetadataArgsStorage } from 'typeorm';

export const securityDatabaseUrl = process.env.API_SECURITY_TEST_DATABASE_URL;

export function assertSecurityDatabaseUrl(url: string) {
  const parsed = new URL(url);
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    parsed.hostname !== '127.0.0.1' ||
    parsed.port !== '55445' ||
    parsed.pathname !== '/api_security_test' ||
    parsed.search ||
    parsed.hash
  )
    throw new Error(
      'Use only isolated api_security_test at 127.0.0.1:55445, without URL options',
    );
}

export async function securityDatabase(
  schema: 'auth_security_test' | 'call_capability_test' | 'queue_admission_test' | 'human_call_test',
) {
  assertSecurityDatabaseUrl(securityDatabaseUrl!);
  const root = resolve(process.cwd(), 'apps/api/src');
  for (const file of readdirSync(root, { recursive: true }))
    if (String(file).endsWith('.entity.ts'))
      require(resolve(root, String(file)));
  const entities = getMetadataArgsStorage().tables.map(
    (t) => t.target as Function,
  );
  const options = {
    type: 'postgres' as const,
    url: securityDatabaseUrl,
    entities,
    schema,
    uuidExtension: 'pgcrypto' as const,
    extra: {
      options: `-c search_path=${schema}`,
      application_name: 'speeko_api_security_test',
    },
  };
  const setup = await new DataSource({
    type: 'postgres',
    url: securityDatabaseUrl,
    entities,
  }).initialize();
  try {
    await setup.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  } finally {
    await setup.destroy();
  }
  const db = await new DataSource({
    ...options,
    synchronize: true,
  }).initialize();
  return { db, connect: () => new DataSource(options).initialize() };
}

/** Wait for actual PostgreSQL lock contention, not an arbitrary timer. */
export async function waitForPrincipalWaiters(db: DataSource, count: number) {
  const deadline = Date.now() + 10000;
  do {
    const [row] =
      await db.query(`SELECT COUNT(*)::int AS n FROM pg_stat_activity
      WHERE application_name='speeko_api_security_test' AND wait_event_type='Lock'
      AND query LIKE '%FOR UPDATE%'`);
    if (row.n >= count) return;
  } while (Date.now() < deadline);
  throw new Error(
    'Concurrent password operations did not reach the principal lock',
  );
}

export async function waitForSecurityRowWaiters(db: DataSource, count: number, table: string) {
  const deadline = Date.now() + 10000;
  const entityAlias = table.split('_').map(part => part[0].toUpperCase() + part.slice(1)).join('');
  do {
    const [row] = await db.query(`SELECT COUNT(*)::int AS n FROM pg_stat_activity
      WHERE application_name = 'speeko_api_security_test' AND wait_event_type = 'Lock'
        AND (query ILIKE $1 OR query ILIKE $2)`, [`%${table}%`, `%${entityAlias}%`]);
    if (row.n >= count) return;
  } while (Date.now() < deadline);
  throw new Error(`Concurrent operations did not reach the ${table} lock`);
}
