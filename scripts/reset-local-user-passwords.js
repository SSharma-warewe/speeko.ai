/**
 * One-off local helper: set known passwords for org users (dev only).
 */
const { Client } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

async function main() {
  const plain = process.argv[2] || 'Demo123!';
  const c = new Client({
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT || 5432),
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
  });
  await c.connect();
  const hash = await bcrypt.hash(plain, 10);
  const emails = ['ops@demo.local', 'agent@acme.com'];
  const res = await c.query(
    'UPDATE users SET password_hash = $1 WHERE email = ANY($2::text[]) RETURNING email',
    [hash, emails],
  );
  console.log(
    JSON.stringify(
      {
        password: plain,
        updated: res.rows.map((r) => r.email),
      },
      null,
      2,
    ),
  );
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
