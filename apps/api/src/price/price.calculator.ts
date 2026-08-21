import {
  displayModel,
  PRICE_CATALOG_AS_OF,
  resolveLlmRate,
  resolveSttRate,
  resolveTtsRate,
  resolveTransportRates,
} from './price.catalog';
import {
  billedMinutesFromMs,
  ROOM_MIN_SECONDS,
  sessionDurationMs,
  STT_MIN_SECONDS,
} from './price.duration';
import {
  amountFromPerMillion,
  amountFromPerMinute,
  roundUsd,
  sumUsd,
} from './price.money';
import type {
  CallCostAttempt,
  CallCostLine,
  CallCostSnapshot,
  PriceAttemptInput,
  PriceRuntimeConfig,
  UsageModelRow,
} from './price.types';

export function extractUsageModels(
  usage: PriceAttemptInput['usage'],
): UsageModelRow[] {
  if (!usage || typeof usage !== 'object') return [];
  const raw = Array.isArray(usage.models)
    ? usage.models
    : Array.isArray(usage.modelUsage)
      ? usage.modelUsage
      : [];
  return raw.filter(
    (row): row is UsageModelRow =>
      !!row && typeof row === 'object' && !Array.isArray(row),
  );
}

function num(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function usageType(row: UsageModelRow): string {
  return String(row.type ?? '').toLowerCase();
}

function modelRef(row: UsageModelRow): string {
  return displayModel(
    typeof row.provider === 'string' ? row.provider : undefined,
    typeof row.model === 'string' ? row.model : undefined,
  );
}

function isLlm(row: UsageModelRow): boolean {
  const t = usageType(row);
  return t === 'llm_usage' || t === 'llm' || t === 'realtime_model_metrics';
}

function isStt(row: UsageModelRow): boolean {
  const t = usageType(row);
  return t === 'stt_usage' || t === 'stt';
}

function isTts(row: UsageModelRow): boolean {
  const t = usageType(row);
  return t === 'tts_usage' || t === 'tts';
}

function isEot(row: UsageModelRow): boolean {
  const t = usageType(row);
  return t === 'eot_usage' || t === 'eot' || t === 'eot_inference_metrics';
}

function pushLine(lines: CallCostLine[], line: CallCostLine): void {
  if (line.quantity <= 0 && line.amountUsd <= 0 && !line.notes) return;
  lines.push({
    ...line,
    quantity: roundUsd(line.quantity),
    unitPriceUsd: roundUsd(line.unitPriceUsd),
    amountUsd: roundUsd(line.amountUsd),
  });
}

function priceLlm(
  row: UsageModelRow,
  plan: PriceRuntimeConfig['plan'],
  unknownModels: string[],
): CallCostLine[] {
  const ref = modelRef(row);
  const rate = resolveLlmRate(ref, plan);
  const inputTokens = Math.max(0, num(row.inputTokens));
  const cachedTokens = Math.max(0, num(row.inputCachedTokens));
  const uncached = Math.max(0, inputTokens - cachedTokens);
  const outputTokens = Math.max(0, num(row.outputTokens));
  const lines: CallCostLine[] = [];
  if (!rate) {
    unknownModels.push(ref);
    if (uncached > 0) {
      pushLine(lines, {
        key: 'llm',
        label: `LLM input (${ref})`,
        model: ref,
        quantity: uncached,
        unit: 'tokens_in',
        unitPriceUsd: 0,
        amountUsd: 0,
        notes: 'unknown model — not in LiveKit inference catalog',
      });
    }
    if (cachedTokens > 0) {
      pushLine(lines, {
        key: 'llm',
        label: `LLM cached input (${ref})`,
        model: ref,
        quantity: cachedTokens,
        unit: 'tokens_cached',
        unitPriceUsd: 0,
        amountUsd: 0,
        notes: 'unknown model — not in LiveKit inference catalog',
      });
    }
    if (outputTokens > 0) {
      pushLine(lines, {
        key: 'llm',
        label: `LLM output (${ref})`,
        model: ref,
        quantity: outputTokens,
        unit: 'tokens_out',
        unitPriceUsd: 0,
        amountUsd: 0,
        notes: 'unknown model — not in LiveKit inference catalog',
      });
    }
    return lines;
  }
  if (uncached > 0) {
    pushLine(lines, {
      key: 'llm',
      label: `LLM input (${rate.key})`,
      model: ref,
      quantity: uncached,
      unit: 'tokens_in',
      unitPriceUsd: rate.input,
      amountUsd: amountFromPerMillion(uncached, rate.input),
    });
  }
  if (cachedTokens > 0) {
    pushLine(lines, {
      key: 'llm',
      label: `LLM cached input (${rate.key})`,
      model: ref,
      quantity: cachedTokens,
      unit: 'tokens_cached',
      unitPriceUsd: rate.cached,
      amountUsd: amountFromPerMillion(cachedTokens, rate.cached),
    });
  }
  if (outputTokens > 0) {
    pushLine(lines, {
      key: 'llm',
      label: `LLM output (${rate.key})`,
      model: ref,
      quantity: outputTokens,
      unit: 'tokens_out',
      unitPriceUsd: rate.output,
      amountUsd: amountFromPerMillion(outputTokens, rate.output),
    });
  }
  return lines;
}

function priceStt(
  row: UsageModelRow,
  plan: PriceRuntimeConfig['plan'],
  sessionMinutes: number,
  unknownModels: string[],
): CallCostLine[] {
  const ref = modelRef(row);
  const rate = resolveSttRate(ref, plan);
  const audioMs = num(row.audioDurationMs);
  const minutes = billedMinutesFromMs(
    audioMs > 0 ? audioMs : sessionMinutes > 0 ? sessionMinutes * 60 * 1000 : null,
    STT_MIN_SECONDS,
  );
  const lines: CallCostLine[] = [];
  if (minutes <= 0) return lines;
  if (!rate) {
    unknownModels.push(ref);
    pushLine(lines, {
      key: 'stt',
      label: `STT (${ref})`,
      model: ref,
      quantity: minutes,
      unit: 'minutes',
      unitPriceUsd: 0,
      amountUsd: 0,
      notes:
        'unknown model — not in LiveKit inference catalog; quantity is audioDurationMs or session clock',
    });
    return lines;
  }
  pushLine(lines, {
    key: 'stt',
    label: `STT (${rate.key})`,
    model: ref,
    quantity: minutes,
    unit: 'minutes',
    unitPriceUsd: rate.usdPerMinute,
    amountUsd: amountFromPerMinute(minutes, rate.usdPerMinute),
    notes:
      audioMs > 0
        ? 'metered from usage audioDurationMs (1s min); LiveKit bills STT connection time'
        : 'audioDurationMs missing; fell back to session clock',
  });
  return lines;
}

function priceTts(
  row: UsageModelRow,
  plan: PriceRuntimeConfig['plan'],
  unknownModels: string[],
): CallCostLine[] {
  const ref = modelRef(row);
  const rate = resolveTtsRate(ref, plan);
  const chars = Math.max(0, num(row.charactersCount));
  const lines: CallCostLine[] = [];
  if (chars <= 0) return lines;
  if (!rate) {
    unknownModels.push(ref);
    pushLine(lines, {
      key: 'tts',
      label: `TTS (${ref})`,
      model: ref,
      quantity: chars,
      unit: 'characters',
      unitPriceUsd: 0,
      amountUsd: 0,
      notes: 'unknown model — not in LiveKit inference catalog',
    });
    return lines;
  }
  pushLine(lines, {
    key: 'tts',
    label: `TTS (${rate.key})`,
    model: ref,
    quantity: chars,
    unit: 'characters',
    unitPriceUsd: rate.usdPerMillionChars,
    amountUsd: amountFromPerMillion(chars, rate.usdPerMillionChars),
  });
  return lines;
}

function priceTransport(
  input: PriceAttemptInput,
  config: PriceRuntimeConfig,
  roomMinutes: number,
): CallCostLine[] {
  if (roomMinutes <= 0) return [];
  const rates = resolveTransportRates(config.plan);
  const medium = String(input.medium ?? '').toLowerCase();
  const sip = medium === 'sip';
  const lines: CallCostLine[] = [];

  if (config.agentDeployed) {
    pushLine(lines, {
      key: 'agent_session',
      label: 'LiveKit Cloud agent session',
      quantity: roomMinutes,
      unit: 'minutes',
      unitPriceUsd: rates.agentSessionUsdPerMinute,
      amountUsd: amountFromPerMinute(roomMinutes, rates.agentSessionUsdPerMinute),
      notes: 'LIVEKIT_AGENT_DEPLOYED=true; 10s minimum',
    });
  }

  const webrtcParticipants = config.agentDeployed
    ? sip
      ? 0
      : 1
    : sip
      ? 1
      : 2;
  if (webrtcParticipants > 0) {
    const qty = roomMinutes * webrtcParticipants;
    pushLine(lines, {
      key: 'webrtc',
      label: config.agentDeployed
        ? 'WebRTC participant (human)'
        : sip
          ? 'WebRTC participant (self-hosted agent)'
          : 'WebRTC participants (self-hosted agent + human)',
      quantity: qty,
      unit: 'minutes',
      unitPriceUsd: rates.webrtcUsdPerMinute,
      amountUsd: amountFromPerMinute(qty, rates.webrtcUsdPerMinute),
      notes: `${webrtcParticipants} participant(s) × session; 10s minimum. Self-hosted agents count as WebRTC minutes.`,
    });
  }

  if (sip) {
    pushLine(lines, {
      key: 'sip',
      label: 'Third-party SIP minutes',
      quantity: roomMinutes,
      unit: 'minutes',
      unitPriceUsd: rates.sipUsdPerMinute,
      amountUsd: amountFromPerMinute(roomMinutes, rates.sipUsdPerMinute),
      notes: 'LiveKit third-party SIP trunk minutes; 10s minimum. Carrier PSTN is separate.',
    });
    if (config.sipVendorUsdPerMin > 0) {
      pushLine(lines, {
        key: 'sip_vendor',
        label: 'SIP carrier (estimate)',
        quantity: roomMinutes,
        unit: 'minutes',
        unitPriceUsd: config.sipVendorUsdPerMin,
        amountUsd: amountFromPerMinute(roomMinutes, config.sipVendorUsdPerMin),
        notes: 'LIVEKIT_SIP_VENDOR_USD_PER_MIN; not a LiveKit charge',
      });
    }
    if (input.krispEnabled) {
      pushLine(lines, {
        key: 'krisp',
        label: 'Voice isolation (Krisp)',
        quantity: roomMinutes,
        unit: 'minutes',
        unitPriceUsd: rates.krispUsdPerMinute,
        amountUsd: amountFromPerMinute(roomMinutes, rates.krispUsdPerMinute),
        notes: 'sip_trunks.krisp_enabled; 10s minimum',
      });
    }
  }

  return lines;
}

export function priceAttempt(
  input: PriceAttemptInput,
  config: PriceRuntimeConfig,
): CallCostAttempt {
  const roomMs = sessionDurationMs(input);
  const roomMinutes = billedMinutesFromMs(roomMs, ROOM_MIN_SECONDS);
  const unknownModels: string[] = [];
  const lines: CallCostLine[] = [];

  lines.push(...priceTransport(input, config, roomMinutes));

  const models = extractUsageModels(input.usage);
  for (const row of models) {
    if (isLlm(row)) {
      lines.push(...priceLlm(row, config.plan, unknownModels));
    } else if (isStt(row)) {
      lines.push(...priceStt(row, config.plan, roomMinutes, unknownModels));
    } else if (isTts(row)) {
      lines.push(...priceTts(row, config.plan, unknownModels));
    } else if (isEot(row)) {
      const requests = Math.max(0, num(row.totalRequests));
      if (requests > 0) {
        pushLine(lines, {
          key: 'eot',
          label: 'Turn detector (conversational intelligence)',
          model: modelRef(row),
          quantity: requests,
          unit: 'requests',
          unitPriceUsd: 0,
          amountUsd: 0,
          notes: 'included in LiveKit Cloud plan; not billed per request',
        });
      }
    }
  }

  const uniqueUnknown = [...new Set(unknownModels.filter(Boolean))];
  return {
    attempt: Math.max(1, input.attempt || 1),
    billedMinutes: roundUsd(roomMinutes),
    totalUsd: sumUsd(lines.map((l) => l.amountUsd)),
    lines,
    unknownModels: uniqueUnknown,
  };
}

function lineMergeKey(line: CallCostLine): string {
  return `${line.key}|${line.model ?? ''}|${line.unit}|${line.unitPriceUsd}`;
}

export function rollupLines(lines: CallCostLine[]): CallCostLine[] {
  const map = new Map<string, CallCostLine>();
  for (const line of lines) {
    const k = lineMergeKey(line);
    const existing = map.get(k);
    if (!existing) {
      map.set(k, { ...line });
      continue;
    }
    existing.quantity = roundUsd(existing.quantity + line.quantity);
    existing.amountUsd = roundUsd(existing.amountUsd + line.amountUsd);
  }
  return [...map.values()];
}

export function mergeAttemptIntoSnapshot(
  existing: CallCostSnapshot | null | undefined,
  attempt: CallCostAttempt,
  config: PriceRuntimeConfig,
): CallCostSnapshot {
  const attempts = [...(existing?.attempts ?? []), attempt];
  const lines = rollupLines(attempts.flatMap((a) => a.lines));
  const unknownModels = [
    ...new Set(attempts.flatMap((a) => a.unknownModels)),
  ];
  return {
    currency: 'USD',
    markup: 0,
    plan: config.plan,
    catalogAsOf: PRICE_CATALOG_AS_OF,
    totalUsd: sumUsd(attempts.map((a) => a.totalUsd)),
    billedMinutes: roundUsd(
      attempts.reduce((acc, a) => acc + a.billedMinutes, 0),
    ),
    unknownModels,
    lines,
    attempts,
  };
}

export function snapshotFromSingleAttempt(
  attempt: CallCostAttempt,
  config: PriceRuntimeConfig,
): CallCostSnapshot {
  return mergeAttemptIntoSnapshot(null, attempt, config);
}

export function isCallCostSnapshot(
  value: unknown,
): value is CallCostSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as CallCostSnapshot;
  return Array.isArray(v.attempts) && Array.isArray(v.lines);
}
