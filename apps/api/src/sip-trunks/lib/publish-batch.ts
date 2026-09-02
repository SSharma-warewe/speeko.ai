import { PublishResourceResultDto } from '../dto/inbound-publish-result.dto';

export async function runPublishBatch<
  TRow extends { id: string },
  TDto,
>(opts: {
  requestedIds?: string[];
  loadByIds: (ids: string[]) => Promise<TRow[]>;
  loadDrafts: () => Promise<TRow[]>;
  livekitId: (row: TRow) => string | null | undefined;
  publishOne: (id: string) => Promise<{ livekitId?: string | null; dto: TDto }>;
  notFoundMessage: (id: string) => string;
  extraFail?: (row: TRow) => string | null;
}): Promise<{ results: PublishResourceResultDto[]; published: TDto[] }> {
  const requested =
    opts.requestedIds && opts.requestedIds.length > 0
      ? opts.requestedIds
      : undefined;

  const candidates = requested
    ? await opts.loadByIds(requested)
    : await opts.loadDrafts();

  const results: PublishResourceResultDto[] = [];
  const published: TDto[] = [];

  if (requested) {
    const found = new Set(candidates.map((c) => c.id));
    for (const id of requested) {
      if (!found.has(id)) {
        results.push({
          id,
          outcome: 'failed',
          message: opts.notFoundMessage(id),
        });
      }
    }
  }

  for (const row of candidates) {
    const extra = opts.extraFail?.(row);
    if (extra) {
      results.push({ id: row.id, outcome: 'failed', message: extra });
      continue;
    }
    const existing = opts.livekitId(row)?.trim();
    if (existing) {
      results.push({
        id: row.id,
        outcome: 'skipped',
        message: 'Already published',
        livekitId: existing,
      });
      continue;
    }
    try {
      const { livekitId, dto } = await opts.publishOne(row.id);
      results.push({
        id: row.id,
        outcome: 'published',
        livekitId: livekitId ?? undefined,
      });
      published.push(dto);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ id: row.id, outcome: 'failed', message });
    }
  }

  return { results, published };
}
