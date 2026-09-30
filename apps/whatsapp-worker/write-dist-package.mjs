import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist/apps/whatsapp-worker');
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, 'package.json'), '{"type":"module"}\n');
