const { Client } = require('pg');
const {
  SipClient,
  RoomServiceClient,
} = require('livekit-server-sdk');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

function httpHost(url) {
  return url.replace('wss://', 'https://').replace('ws://', 'http://');
}

async function main() {
  const c = new Client({
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT || 5432),
    user: process.env.DATABASE_USER || 'callagent',
    password: process.env.DATABASE_PASSWORD || 'callagent',
    database: process.env.DATABASE_NAME || 'callagent',
  });
  await c.connect();
  const calls = await c.query(`
    SELECT id, status, medium, direction, from_number, to_number, room_name,
           livekit_dispatch_id, livekit_sip_call_id, participant_identity,
           error_message, context, started_at, answered_at, ended_at, created_at
    FROM calls
    ORDER BY created_at DESC
    LIMIT 5
  `);
  const trunks = await c.query(`
    SELECT id, name, livekit_trunk_id, numbers, provider_address, auth_username, is_active
    FROM sip_trunks
  `);
  console.log('=== DB CALLS ===');
  console.log(JSON.stringify(calls.rows, null, 2));
  console.log('=== DB SIP TRUNKS ===');
  console.log(JSON.stringify(trunks.rows, null, 2));
  await c.end();

  const host = httpHost(process.env.LIVEKIT_URL);
  const sip = new SipClient(host, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
  const rooms = new RoomServiceClient(host, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);

  console.log('=== LIVEKIT OUTBOUND TRUNKS ===');
  const lkTrunks = await sip.listSipOutboundTrunk();
  console.log(
    JSON.stringify(
      lkTrunks.map((t) => ({
        sipTrunkId: t.sipTrunkId,
        name: t.name,
        address: t.address,
        numbers: t.numbers,
        authUsername: t.authUsername,
        transport: t.transport,
        destinationCountry: t.destinationCountry,
        metadata: t.metadata,
      })),
      null,
      2,
    ),
  );

  const latestRoom = calls.rows[0]?.room_name;
  if (latestRoom) {
    console.log('=== ROOM PARTICIPANTS:', latestRoom, '===');
    try {
      const parts = await rooms.listParticipants(latestRoom);
      console.log(
        JSON.stringify(
          parts.map((p) => ({
            identity: p.identity,
            name: p.name,
            state: p.state,
            kind: p.kind,
            attributes: p.attributes,
            metadata: p.metadata,
          })),
          null,
          2,
        ),
      );
    } catch (e) {
      console.log('listParticipants error:', e.message || e);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
