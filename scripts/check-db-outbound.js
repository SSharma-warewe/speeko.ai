const { Client } = require('pg');

const c = new Client({
  host: process.env.DATABASE_HOST || 'localhost',
  port: Number(process.env.DATABASE_PORT || 5432),
  user: process.env.DATABASE_USER || 'callagent',
  password: process.env.DATABASE_PASSWORD || 'callagent',
  database: process.env.DATABASE_NAME || 'callagent',
});

async function main() {
  await c.connect();

  const orgs = await c.query(
    'SELECT id, name, slug FROM organizations ORDER BY created_at DESC LIMIT 10',
  );
  const agents = await c.query(
    'SELECT id, key, direction, is_active FROM agents ORDER BY key',
  );
  const oa = await c.query(`
    SELECT oa.id, oa.organization_id, oa.agent_id, a.key, a.direction, oa.is_active
    FROM organization_agents oa
    JOIN agents a ON a.id = oa.agent_id
    ORDER BY oa.created_at DESC
    LIMIT 20
  `);
  const st = await c.query(`
    SELECT id, organization_id, name, livekit_trunk_id, numbers, is_active
    FROM sip_trunks
    ORDER BY created_at DESC
    LIMIT 20
  `);

  console.log(JSON.stringify({ orgs: orgs.rows, agents: agents.rows, orgAgents: oa.rows, sipTrunks: st.rows }, null, 2));
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
