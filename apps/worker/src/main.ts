import { InferenceRunner, ServerOptions, cli } from '@livekit/agents';
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load monorepo root .env (when run as tsx apps/worker/src/main.ts from repo root)
const envCandidates = [
  resolve(process.cwd(), '.env'),
  resolve(__dirname, '../../../.env'),
  resolve(__dirname, '../../.env'),
];
for (const p of envCandidates) {
  if (existsSync(p)) {
    loadEnv({ path: p });
    break;
  }
}

const required = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'] as const;
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env ${key}. Set it in .env (see .env.example).`);
    process.exit(1);
  }
}

/**
 * Skip local audio-EOT runner registration so AgentServer does not spawn the
 * shared InferenceProcExecutor (~138 MB model). We use cloud TurnDetector v1
 * instead; in-process Silero VAD (~2 MB) still loads for barge-in.
 *
 * Must be installed before cli.runApp → AgentServer construction.
 */
const LOCAL_EOT_METHOD = 'lk_eot_audio';
const originalRegisterRunner = InferenceRunner.registerRunner.bind(InferenceRunner);
InferenceRunner.registerRunner = (method: string, importPath: string) => {
  if (method === LOCAL_EOT_METHOD) {
    console.log(
      '[worker] skipping local EOT runner registration (cloud TurnDetector v1; saves ~138MB idle)',
    );
    return;
  }
  return originalRegisterRunner(method, importPath);
};

const agentName = process.env.LIVEKIT_AGENT_NAME || 'call-agent';

/**
 * Cap pre-warmed job child processes to cut idle RAM on small hosts (e.g. Railway).
 * LiveKit production default is min(availableParallelism(), 4) — often hundreds of MB idle.
 *
 * Note: @livekit/agents ServerOptions uses `numIdleProcesses || default`, so 0 is treated
 * as "unset" and falls back to the production default. Minimum effective value is 1.
 */
function resolveNumIdleProcesses(): number {
  const raw = process.env.LIVEKIT_NUM_IDLE_PROCESSES;
  if (raw === undefined || raw === '') {
    return 1;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    console.warn(
      `LIVEKIT_NUM_IDLE_PROCESSES=${raw} is invalid or 0; using 1 ` +
        `(LiveKit treats 0 as unset and would restore the multi-process default).`,
    );
    return 1;
  }
  return n;
}

const numIdleProcesses = resolveNumIdleProcesses();

// Job subprocesses import defineAgent from this file (not main). tsx → .ts; prod node → .js.
const agentEntry = fileURLToPath(
  new URL(import.meta.url.endsWith('.ts') ? './agent.ts' : './agent.js', import.meta.url),
);

console.log(
  `[worker] starting agentName=${agentName} numIdleProcesses=${numIdleProcesses} agentEntry=${agentEntry}`,
);

cli.runApp(
  new ServerOptions({
    agent: agentEntry,
    agentName,
    numIdleProcesses,
  }),
);
