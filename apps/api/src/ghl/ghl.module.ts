import { Global, Module } from '@nestjs/common';
import { GhlService } from './ghl.service';

/**
 * GoHighLevel CRM adapter.
 * Infrastructure only — no HTTP controllers. Inject GhlService elsewhere.
 */
@Global()
@Module({
  providers: [GhlService],
  exports: [GhlService],
})
export class GhlModule {}
