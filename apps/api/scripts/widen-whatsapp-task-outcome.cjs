// Run with the API database environment. Inspection is the default; --apply
// performs only a data-preserving varchar widening before TypeORM startup.
const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT || 5432),
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
  });
  await client.connect();
  try {
    const {
      rows: [column],
    } = await client.query(
      "SELECT data_type, character_maximum_length AS length FROM information_schema.columns WHERE table_schema='public' AND table_name='whatsapp_task_sessions' AND column_name='outcome'",
    );
    if (
      !column ||
      column.data_type !== 'character varying' ||
      ![30, 64].includes(column.length)
    ) {
      throw new Error(
        'Unexpected outcome column; inspect the schema before migration',
      );
    }
    if (!process.argv.includes('--apply') || column.length === 64) {
      console.log(
        JSON.stringify({
          outcomeLength: column.length,
          action: column.length === 64 ? 'already_current' : 'inspection_only',
        }),
      );
      return;
    }
    await client.query('BEGIN');
    try {
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='15s'");
      await client.query(
        'LOCK TABLE public.whatsapp_task_sessions IN ACCESS EXCLUSIVE MODE',
      );
      const fingerprint =
        "SELECT count(*)::int AS total, count(outcome)::int AS populated, md5(coalesce(string_agg(id::text || ':' || coalesce(outcome,'<null>'), '|' ORDER BY id),'')) AS digest FROM public.whatsapp_task_sessions";
      const {
        rows: [before],
      } = await client.query(fingerprint);
      await client.query(
        'ALTER TABLE public.whatsapp_task_sessions ALTER COLUMN outcome TYPE varchar(64)',
      );
      const {
        rows: [after],
      } = await client.query(fingerprint);
      if (JSON.stringify(before) !== JSON.stringify(after))
        throw new Error('Outcome preservation check failed');
      await client.query('COMMIT');
      console.log(
        JSON.stringify({
          outcomeLength: 64,
          action: 'widened',
          sessionsPreserved: after.total,
          populatedOutcomesPreserved: after.populated,
        }),
      );
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    await client.end();
  }
}
main().catch(() => {
  console.error(
    'Outcome migration failed; no credentials or row contents were logged',
  );
  process.exitCode = 1;
});
