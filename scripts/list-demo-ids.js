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

  const cols = await c.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'organization_agents' ORDER BY ordinal_position`,
  );
  console.log('organization_agents columns:', cols.rows.map((r) => r.column_name));

  const orgs = await c.query('SELECT id, name, slug FROM organizations LIMIT 10');
  console.log('\norganizations:', JSON.stringify(orgs.rows, null, 2));

  const agents = await c.query('SELECT id, name, key, direction FROM agents');
  console.log('\nagents:', JSON.stringify(agents.rows, null, 2));

  const oa = await c.query('SELECT * FROM organization_agents LIMIT 20');
  console.log('\norganization_agents:', JSON.stringify(oa.rows, null, 2));

  const st = await c.query('SELECT * FROM sip_trunks LIMIT 10');
  console.log('\nsip_trunks:', JSON.stringify(st.rows, null, 2));

  const tables = await c.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' ORDER BY table_name`,
  );
  console.log('\ntables:', tables.rows.map((r) => r.table_name));

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
