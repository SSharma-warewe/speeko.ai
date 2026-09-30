import 'dotenv/config';
import { createServer, type IncomingMessage } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  WHATSAPP_AGENT_TOOL_IDS,
  type WhatsAppWorkerTurn,
} from '@call-agent/contracts';
import { HarnessApiClient } from './api-client.js';
import { runTurn } from './runner.js';

const secret = process.env.WORKER_CALLBACK_SECRET?.trim() ?? '';
const apiUrl = process.env.API_BASE_URL?.trim() ?? '';
const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? '';
if (!secret || !apiUrl || !apiKey)
  throw new Error(
    'API_BASE_URL, WORKER_CALLBACK_SECRET and OPENROUTER_API_KEY are required',
  );
const capacity = Math.min(
  100,
  Math.max(1, Math.trunc(Number(process.env.WHATSAPP_WORKER_CONCURRENCY)) || 4),
);
const timeoutMs = Math.min(
  150_000,
  Math.max(
    30_000,
    Number(process.env.WHATSAPP_WORKER_TURN_TIMEOUT_MS) || 90_000,
  ),
);
const api = new HarnessApiClient(apiUrl, secret);
const active = new Map<string, AbortController>();
let stopping = false;
const snapshot = z.object({
  state: z.record(z.unknown()),
  events: z.array(z.record(z.unknown())),
});
const turnSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  generation: z.number().int().positive(),
  leaseToken: z.string().uuid(),
  sender: z.string().regex(/^\d{6,20}$/),
  body: z.string().min(1).max(4096),
  prompt: z.string().min(1).max(20_000),
  enabledTools: z.array(z.enum(WHATSAPP_AGENT_TOOL_IDS)),
  session: snapshot,
  checkpoint: z
    .object({ session: snapshot, reply: z.string().max(4096).optional() })
    .nullable(),
});

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 3_000_000) throw new Error('body_too_large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}

async function execute(turn: WhatsAppWorkerTurn, controller: AbortController) {
  const deadline = setTimeout(() => controller.abort(), timeoutMs);
  let heartbeating = false;
  const heartbeat = setInterval(() => {
    if (heartbeating) return;
    heartbeating = true;
    void api
      .post(turn, 'heartbeat')
      .catch(() => controller.abort())
      .finally(() => {
        heartbeating = false;
      });
  }, 10_000);
  try {
    const result = await runTurn(turn, api, apiKey, controller.signal);
    if (controller.signal.aborted) throw new Error('turn_aborted');
    await api.post(turn, 'complete', result);
  } catch {
    await api
      .post(turn, 'fail', {
        errorCode: controller.signal.aborted ? 'turn_aborted' : 'model_error',
      })
      .catch(() => undefined);
    console.warn(`[whatsapp-worker] turn failed id=${turn.id}`);
  } finally {
    clearTimeout(deadline);
    clearInterval(heartbeat);
    active.delete(turn.id);
  }
}

const server = createServer(async (request, response) => {
  const send = (status: number, body: object) => {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
  };
  if (request.url === '/health' && request.method === 'GET')
    return send(stopping ? 503 : 200, {
      ready: !stopping,
      active: active.size,
      capacity,
    });
  const supplied = Buffer.from(
    String(request.headers['x-worker-secret'] ?? ''),
  );
  const expected = Buffer.from(secret);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return send(401, { error: 'unauthorized' });
  if (request.url !== '/turns' || request.method !== 'POST')
    return send(404, { error: 'not_found' });
  try {
    const parsed = turnSchema.safeParse(await readJson(request));
    if (!parsed.success) return send(400, { error: 'invalid_turn' });
    const turn = parsed.data;
    if (active.has(turn.id) || stopping || active.size >= capacity)
      return send(429, { error: 'worker_busy' });
    const controller = new AbortController();
    active.set(turn.id, controller);
    send(202, { accepted: true });
    void execute(turn, controller);
  } catch {
    send(400, { error: 'invalid_request' });
  }
});

// Dual-stack listener: Railway private networking may resolve IPv6 addresses.
server.listen(Number(process.env.PORT) || 8082, '::', () =>
  console.log('[whatsapp-worker] listening'),
);
function shutdown() {
  stopping = true;
  server.close();
  for (const controller of active.values()) controller.abort();
  setTimeout(() => process.exit(0), 15_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
