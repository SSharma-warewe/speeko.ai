/**
 * Emit dist/apps/worker/package.json with "type": "module" so
 * `node dist/apps/worker/main.js` is treated as ESM (root package is not).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const workerRoot = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = join(workerRoot, '..', '..');
const outDir = join(monorepoRoot, 'dist', 'apps', 'worker');
const outFile = join(outDir, 'package.json');

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, `${JSON.stringify({ type: 'module' }, null, 2)}\n`, 'utf8');
console.log(`[build:worker] wrote ${outFile}`);
