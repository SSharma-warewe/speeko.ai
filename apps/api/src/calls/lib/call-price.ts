import { Logger } from '@nestjs/common';
import { PriceService } from '../../price/price.service';
import { Call } from '../call.entity';

export async function priceAttemptSafe(
  priceService: PriceService,
  logger: Logger,
  call: Call,
  mode: 'append' | 'fill',
): Promise<void> {
  try {
    if (mode === 'fill') {
      await priceService.fillCostIfMissing(call);
    } else {
      await priceService.applyAttemptToCall(call);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`Cost pricing failed call=${call.id}: ${message}`);
  }
}
