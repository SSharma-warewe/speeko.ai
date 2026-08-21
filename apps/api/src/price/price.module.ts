import { Module } from '@nestjs/common';
import { SipTrunksModule } from '../sip-trunks/sip-trunks.module';
import { AdminPriceController } from './admin-price.controller';
import { PriceService } from './price.service';

/**
 * LiveKit list-price cost analysis (no markup).
 * Calculator is used by CallsService on worker complete; admin HTTP is summary + backfill.
 */
@Module({
  imports: [SipTrunksModule],
  controllers: [AdminPriceController],
  providers: [PriceService],
  exports: [PriceService],
})
export class PriceModule {}
