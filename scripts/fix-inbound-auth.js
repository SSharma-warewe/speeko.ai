require('dotenv').config();
const { SipClient, SIPInboundTrunkInfo } = require('livekit-server-sdk');
const { Client } = require('pg');

async function main() {
  const trunkId = 'ST_GV9h8mAACkbo';
  const sip = new SipClient(
    process.env.LIVEKIT_URL,
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
  );

  // Outbound Frejun credentials must NOT be on the inbound trunk.
  // LiveKit would require Frejun to digest-auth when INVITEing LiveKit.
  const replaced = await sip.updateSipInboundTrunk(
    trunkId,
    new SIPInboundTrunkInfo({
      name: 'inbound trunk',
      numbers: ['+918065179684'],
      krispEnabled: true,
    }),
  );

  console.log('LiveKit trunk updated:', {
    id: replaced.sipTrunkId,
    numbers: replaced.numbers,
    authUsername: replaced.authUsername || null,
    hasAuthPassword: Boolean(replaced.authPassword),
    krispEnabled: replaced.krispEnabled,
  });

  const c = new Client({
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT || 5432),
    user: process.env.DATABASE_USER || 'callagent',
    password: process.env.DATABASE_PASSWORD || 'callagent',
    database: process.env.DATABASE_NAME || 'callagent',
  });
  await c.connect();
  await c.query(
    `UPDATE sip_trunks
     SET auth_username = NULL, auth_password = NULL
     WHERE livekit_trunk_id = $1`,
    [trunkId],
  );
  const row = await c.query(
    `SELECT id, name, numbers, auth_username,
            (auth_password IS NOT NULL AND auth_password <> '') AS has_pw,
            livekit_trunk_id
     FROM sip_trunks WHERE livekit_trunk_id = $1`,
    [trunkId],
  );
  console.log('Local row updated:', row.rows[0]);
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
