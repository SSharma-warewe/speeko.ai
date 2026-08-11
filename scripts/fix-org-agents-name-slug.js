/**
 * One-shot: add/backfill organization_agents.name + slug on Railway Postgres
 * so TypeORM synchronize can complete (NOT NULL columns with existing rows).
 *
 * Usage:
 *   node scripts/fix-org-agents-name-slug.js
 *
 * Env (or edit defaults for TCP proxy):
 *   PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
 */
const { Client } = require('pg');

const client = new Client({
  host: process.env.PGHOST || 'altaria.proxy.rlwy.net',
  port: Number(process.env.PGPORT || 26003),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || process.env.DATABASE_PASSWORD,
  database: process.env.PGDATABASE || 'railway',
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 20000,
});

function slugify(s) {
  return (
    String(s || 'agent')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'agent'
  );
}

async function main() {
  if (!client.password) {
    console.error('Set PGPASSWORD or DATABASE_PASSWORD');
    process.exit(1);
  }

  await client.connect();
  console.log('connected');

  const cols = await client.query(`
    SELECT column_name, is_nullable, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organization_agents'
    ORDER BY ordinal_position
  `);
  console.log('columns:', cols.rows.map((r) => `${r.column_name}:${r.is_nullable}`).join(', '));

  const cons = await client.query(`
    SELECT conname, contype, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'organization_agents'::regclass
  `);
  console.log(
    'constraints:',
    cons.rows.map((r) => `${r.conname}(${r.contype}) ${r.def}`).join(' | '),
  );

  const rows = await client.query(`
    SELECT oa.id, oa.organization_id, oa.agent_id, a.key AS agent_key, a.name AS agent_name
    FROM organization_agents oa
    LEFT JOIN agents a ON a.id = oa.agent_id
  `);
  console.log('row_count:', rows.rows.length);

  await client.query('BEGIN');
  try {
    await client.query(`
      ALTER TABLE organization_agents
      ADD COLUMN IF NOT EXISTS name character varying(255)
    `);
    await client.query(`
      ALTER TABLE organization_agents
      ADD COLUMN IF NOT EXISTS slug character varying(80)
    `);

    const all = await client.query(`
      SELECT oa.id, oa.organization_id, oa.name, oa.slug, a.key AS agent_key, a.name AS agent_name
      FROM organization_agents oa
      LEFT JOIN agents a ON a.id = oa.agent_id
    `);

    const used = new Map();
    for (const r of all.rows) {
      if (!used.has(r.organization_id)) used.set(r.organization_id, new Set());
      if (r.slug && String(r.slug).trim()) {
        used.get(r.organization_id).add(String(r.slug).trim());
      }
    }

    for (const r of all.rows) {
      const needsName = !r.name || !String(r.name).trim();
      const needsSlug = !r.slug || !String(r.slug).trim();
      if (!needsName && !needsSlug) continue;

      const baseName =
        (r.agent_name && String(r.agent_name).trim()) ||
        (r.agent_key && String(r.agent_key).trim()) ||
        'Agent';
      const name = needsName ? baseName : String(r.name).trim();

      let baseSlug = needsSlug
        ? slugify(r.agent_key || name)
        : String(r.slug).trim();
      if (!used.has(r.organization_id)) used.set(r.organization_id, new Set());
      const set = used.get(r.organization_id);
      let slug = baseSlug;
      let i = 2;
      while (set.has(slug)) {
        slug = `${baseSlug}-${i}`.slice(0, 80);
        i += 1;
      }
      set.add(slug);

      await client.query(
        `UPDATE organization_agents SET name = $1, slug = $2 WHERE id = $3`,
        [name, slug, r.id],
      );
      console.log('backfilled', r.id, '->', name, '/', slug);
    }

    const nulls = await client.query(`
      SELECT count(*)::int AS c FROM organization_agents
      WHERE name IS NULL OR slug IS NULL
         OR btrim(name) = '' OR btrim(slug) = ''
    `);
    if (nulls.rows[0].c > 0) {
      throw new Error(`still have null/empty name/slug: ${nulls.rows[0].c}`);
    }

    await client.query(
      `ALTER TABLE organization_agents ALTER COLUMN name SET NOT NULL`,
    );
    await client.query(
      `ALTER TABLE organization_agents ALTER COLUMN slug SET NOT NULL`,
    );

    const uniques = await client.query(`
      SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = 'organization_agents'::regclass AND contype = 'u'
    `);

    for (const u of uniques.rows) {
      const def = u.def.toLowerCase();
      if (
        def.includes('organization_id') &&
        def.includes('agent_id') &&
        !def.includes('slug')
      ) {
        console.log('dropping old unique', u.conname, u.def);
        await client.query(
          `ALTER TABLE organization_agents DROP CONSTRAINT IF EXISTS "${u.conname.replace(/"/g, '')}"`,
        );
      }
    }

    const slugUnique = await client.query(`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'organization_agents'::regclass AND contype = 'u'
        AND (
          conname = 'uq_organization_agents_org_slug'
          OR pg_get_constraintdef(oid) ILIKE '%slug%'
        )
    `);
    if (slugUnique.rows.length === 0) {
      await client.query(`
        ALTER TABLE organization_agents
        ADD CONSTRAINT uq_organization_agents_org_slug UNIQUE (organization_id, slug)
      `);
      console.log('added uq_organization_agents_org_slug');
    } else {
      console.log('slug unique already present:', slugUnique.rows[0].conname);
    }

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_organization_agents_organization_id
      ON organization_agents (organization_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_organization_agents_agent_id
      ON organization_agents (agent_id)
    `);

    await client.query('COMMIT');
    console.log('MIGRATION_OK');

    const final = await client.query(
      `SELECT id, name, slug FROM organization_agents ORDER BY created_at NULLS LAST`,
    );
    console.log('data:', final.rows);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('MIGRATION_FAILED', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
