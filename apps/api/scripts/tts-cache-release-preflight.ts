/** Reproduce the production TTS delta only inside the guarded disposable fixture. */
import { writeFileSync } from 'node:fs';
import { securityDatabase } from '../src/common/test/api-security-database';

async function main() {
  const { db } = await securityDatabase('tts_cache_test');
  const [{ indexdef }] = await db.query(
    "SELECT indexdef FROM pg_indexes WHERE schemaname='tts_cache_test' AND indexname='uq_whatsapp_tool_operation'",
  );
  try {
    // The production baseline lacks the cache additions and has this older
    // WhatsApp index predicate. Confirm TypeORM will leave that index alone.
    await db.query('DROP TABLE tts_cache_test.tts_cache_entries');
    await db.query(
      'ALTER TABLE tts_cache_test.agents DROP COLUMN tts_cache_enabled',
    );
    await db.query(
      'ALTER TABLE tts_cache_test.organization_agents DROP COLUMN tts_cache_enabled',
    );
    await db.query('DROP INDEX tts_cache_test.uq_whatsapp_tool_operation');
    await db.query(
      'CREATE UNIQUE INDEX uq_whatsapp_tool_operation ON tts_cache_test.whatsapp_tool_operations (conversation_id, generation, operation_key)',
    );
    const sql = await db.driver.createSchemaBuilder().log();
    const pending = sql.upQueries.map(({ query }) =>
      query
        .replaceAll('"tts_cache_test".', '"public".')
        .replaceAll('gen_random_uuid()', 'uuid_generate_v4()'),
    );
    const queries = pending
      .filter((query) => /tts_cache_entries|tts_cache_enabled/.test(query))
      .map((query) =>
        query.replace(
          /(?<!\.)"(tts_cache_entries|agents|organization_agents|organizations)"/g,
          '"public"."$1"',
        ),
      );
    const excluded = pending.filter(
      (query) => !/tts_cache_entries|tts_cache_enabled/.test(query),
    );
    if (
      excluded.some(
        (query) =>
          !/^ALTER TABLE "[a-z_]+" ALTER COLUMN "[a-z_]+" SET DEFAULT /.test(
            query,
          ),
      )
    )
      throw new Error(
        'Unexpected unrelated schema change; deployment must stop',
      );
    if (
      queries.length !== 8 ||
      queries.some(
        (query) =>
          !(
            /^CREATE TABLE "public"\."tts_cache_entries" /.test(query) ||
            /^CREATE (UNIQUE )?INDEX "(?:uq_tts_cache_org_digest|idx_tts_cache_expiry|idx_tts_cache_created|idx_tts_cache_org_created)" ON "public"\."tts_cache_entries" /.test(
              query,
            ) ||
            /^ALTER TABLE "public"\."(?:agents|organization_agents)" ADD "tts_cache_enabled" boolean$/.test(
              query,
            ) ||
            /^ALTER TABLE "public"\."tts_cache_entries" ADD CONSTRAINT "FK_79225832deffed5d17899333cc0" FOREIGN KEY /.test(
              query,
            )
          ),
      )
    )
      throw new Error('Unexpected schema change; deployment must stop');
    if (!process.env.TTS_SCHEMA_DELTA_OUTPUT)
      throw new Error('TTS_SCHEMA_DELTA_OUTPUT is required');
    writeFileSync(
      process.env.TTS_SCHEMA_DELTA_OUTPUT,
      JSON.stringify({ queries }, null, 2),
    );
    console.log(
      JSON.stringify({
        additiveStatements: queries.length,
        queries,
        unrelatedIndexPreserved: true,
        excludedDefaultReapplications: excluded.length,
        requiresProductionSynchronizeFalse: true,
      }),
    );
  } finally {
    await db.query('DROP INDEX tts_cache_test.uq_whatsapp_tool_operation');
    await db.query(indexdef);
    await db.synchronize();
    await db.destroy();
  }
}
main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
