/**
 * Retry CreateSIPParticipant with trunk-aligned fromNumber formats
 * and waitUntilAnswered so carrier SIP errors surface.
 */
const { SipClient, RoomServiceClient, AgentDispatchClient } =
  require('livekit-server-sdk');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

function httpHost(url) {
  return url.replace('wss://', 'https://').replace('ws://', 'http://');
}

async function main() {
  const host = httpHost(process.env.LIVEKIT_URL);
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  const trunkId = process.env.LIVEKIT_SIP_OUTBOUND_TRUNK_ID || 'ST_t6rmvwZgb5iV';
  const to = process.argv[2] || '+918852863728';
  const fromCandidates = process.argv[3]
    ? [process.argv[3]]
    : ['8065179684', '+918065179684', '918065179684'];

  const sip = new SipClient(host, key, secret);
  const rooms = new RoomServiceClient(host, key, secret);

  console.log('Listing outbound trunks...');
  const trunks = await sip.listSipOutboundTrunk();
  const trunk = trunks.find((t) => t.sipTrunkId === trunkId);
  console.log('Trunk:', JSON.stringify(trunk, null, 2));

  for (const from of fromCandidates) {
    const roomName = `dial-test-${Date.now()}`;
    console.log(`\n=== Try from=${from} to=${to} room=${roomName} ===`);
    try {
      await rooms.createRoom({ name: roomName, emptyTimeout: 120 });
      const p = await sip.createSipParticipant(trunkId, to, roomName, {
        fromNumber: from,
        participantIdentity: to,
        waitUntilAnswered: true,
        playDialtone: true,
        ringingTimeout: 25,
        timeout: 40,
      });
      console.log('SUCCESS:', {
        participantId: p.participantId,
        identity: p.participantIdentity,
        sipCallId: p.sipCallId,
      });
      await rooms.deleteRoom(roomName).catch(() => {});
      return;
    } catch (e) {
      console.error('FAILED:', {
        name: e?.name,
        message: e?.message,
        sipStatus: e?.sipStatus,
        sipStatusCode: e?.sipStatusCode,
        code: e?.code,
        status: e?.status,
        metadata: e?.metadata,
      });
      // dump full error keys
      console.error('raw:', e);
      await rooms.deleteRoom(roomName).catch(() => {});
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
