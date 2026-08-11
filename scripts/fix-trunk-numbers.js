const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: 'localhost',
    port: 5432,
    user: 'callagent',
    password: 'callagent',
    database: 'callagent',
  });
  await c.connect();
  await c.query(
    `UPDATE sip_trunks SET numbers = $1::jsonb WHERE livekit_trunk_id = $2`,
    [JSON.stringify(['+918065179684', '8065179684']), 'ST_t6rmvwZgb5iV'],
  );
  const r = await c.query(
    'SELECT id, numbers, livekit_trunk_id FROM sip_trunks',
  );
  console.log(JSON.stringify(r.rows, null, 2));
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
