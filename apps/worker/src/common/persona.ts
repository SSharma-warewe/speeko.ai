import type { AgentJobMetadata } from '@call-agent/contracts';

/** Persona asked for Hindi (portal system prompt). Used for opening/goodbye/script lock. */
export function personaSpeaksHindi(meta: AgentJobMetadata): boolean {
  const prompt = meta.prompt?.systemPrompt ?? '';
  return /hindi|हिंदी|हिन्दी|devanagari/i.test(prompt);
}
