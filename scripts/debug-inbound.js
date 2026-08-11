const { Client } = require('pg');
const { SipClient } = require('livekit-server-sdk');
require('dotenv').config();

async function main() {
  const c = new Client({
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT || 5432),
    user: process.env.DATABASE_USER || 'callagent',
    password: process.env.DATABASE_PASSWORD || 'callagent',
    database: process.env.DATABASE_NAME || 'callagent',
  });
  await c.connect();

  const trunks = await c.query(
    `SELECT id, organization_id, name, direction, numbers, livekit_trunk_id,
            is_active, published_at, allowed_numbers, allowed_addresses,
            auth_username, (auth_password IS NOT NULL AND auth_password <> '') AS has_auth_password,
            krisp_enabled, created_at
     FROM sip_trunks
     ORDER BY created_at DESC`,
  );
  const rules = await c.query(
    `SELECT id, organization_id, name, rule_type, room_prefix, room_name,
            sip_trunk_ids, organization_agent_id, agent_name,
            livekit_dispatch_rule_id, is_active, published_at, created_at
     FROM sip_dispatch_rules
     ORDER BY created_at DESC`,
  );
  const agents = await c.query(
    `SELECT oa.id, oa.organization_id, oa.is_active, a.key AS template_key, a.name AS template_name
     FROM organization_agents oa
     JOIN agents a ON a.id = oa.agent_id
     ORDER BY oa.created_at DESC`,
  );

  console.log('=== LOCAL TRUNKS ===');
  console.log(JSON.stringify(trunks.rows, null, 2));
  console.log('=== LOCAL DISPATCH RULES ===');
  console.log(JSON.stringify(rules.rows, null, 2));
  console.log('=== ORG AGENTS ===');
  console.log(JSON.stringify(agents.rows, null, 2));

  const sip = new SipClient(
    process.env.LIVEKIT_URL,
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
  );
  const inbound = await sip.listSipInboundTrunk();
  const dispatch = await sip.listSipDispatchRule();

  console.log('=== LIVEKIT INBOUND ===');
  console.log(
    JSON.stringify(
      inbound.map((t) => ({
        id: t.sipTrunkId,
        name: t.name,
        numbers: t.numbers,
        allowedNumbers: t.allowedNumbers,
        allowedAddresses: t.allowedAddresses,
        authUsername: t.authUsername || null,
        hasAuthPassword: Boolean(t.authPassword),
      })),
      null,
      2,
    ),
  );
  console.log('=== LIVEKIT RULES (summary) ===');
  console.log(
    JSON.stringify(
      dispatch.map((r) => ({
        id: r.sipDispatchRuleId,
        name: r.name,
        trunkIds: r.trunkIds,
        agentName: r.roomConfig?.agents?.[0]?.agentName || null,
        ruleType: Object.keys(r.rule || {})[0] || null,
      })),
      null,
      2,
    ),
  );

  // Heuristics
  console.log('\n=== DIAGNOSIS ===');
  for (const t of inbound) {
    const issues = [];
    if (!t.numbers?.length) issues.push('no numbers on inbound trunk');
    if (t.authUsername) {
      issues.push(
        `inbound trunk requires SIP auth username="${t.authUsername}" — Frejun must send matching credentials when INVITEing LiveKit, or auth will fail`,
      );
    }
    if (t.allowedNumbers?.length) {
      issues.push(
        `allowedNumbers is set (${t.allowedNumbers.join(',')}) — only those callers can dial in`,
      );
    }
    if (t.allowedAddresses?.length) {
      issues.push(
        `allowedAddresses is set (${t.allowedAddresses.join(',')}) — provider IP must match`,
      );
    }
    const matchingRules = dispatch.filter((r) =>
      (r.trunkIds || []).includes(t.sipTrunkId),
    );
    if (matchingRules.length === 0) {
      issues.push('no dispatch rule bound to this trunk id');
    } else {
      for (const r of matchingRules) {
        const agent = r.roomConfig?.agents?.[0]?.agentName;
        if (!agent) issues.push(`rule ${r.sipDispatchRuleId} has no roomConfig agent`);
        else if (agent !== 'call-agent' && agent !== process.env.LIVEKIT_AGENT_NAME) {
          issues.push(
            `rule ${r.sipDispatchRuleId} dispatches agentName="${agent}" — worker is registered as "${process.env.LIVEKIT_AGENT_NAME || 'call-agent'}"`,
          );
        }
      }
    }
    console.log(`Trunk ${t.sipTrunkId} (${t.name}) numbers=${JSON.stringify(t.numbers)}`);
    if (issues.length === 0) {
      console.log(
        '  App/LiveKit config looks OK for agent dispatch. If PSTN still fails, Frejun must ORIGINATE inbound for this DID to your LiveKit SIP URI (project settings), not only allow outbound.',
      );
    } else {
      issues.forEach((i) => console.log('  - ' + i));
    }
  }

  const projectUrl = process.env.LIVEKIT_URL || '';
  console.log('\nLiveKit WS URL:', projectUrl);
  console.log(
    'Inbound requires Frejun to route DID → LiveKit SIP endpoint (sip:<project-sip-subdomain>.sip.livekit.cloud). Creating ST_/SDR_ in LiveKit does NOT reconfigure Frejun.',
  );

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
