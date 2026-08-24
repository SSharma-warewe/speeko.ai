import { Module } from '@nestjs/common';
import { SipTrunksModule } from '../sip-trunks/sip-trunks.module';
import { AdminPriceController } from './admin-price.controller';
import { PriceService } from './price.service';
import { UserPriceController } from './user-price.controller';

/**
 * LiveKit list-price cost analysis (no markup).
 * Calculator is used by CallWorkerService / CallFailureService on worker complete.
 * HTTP: org-user summary (JWT org) + admin summary/backfill.
 */
@Module({
  imports: [SipTrunksModule],
  controllers: [AdminPriceController, UserPriceController],
  providers: [PriceService],
  exports: [PriceService],
})
export class PriceModule {}
