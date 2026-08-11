import { Module } from '@nestjs/common';
import { LivekitService } from './livekit.service';

/** LiveKit Cloud adapter only — no HTTP controllers or domain logic. */
@Module({
  providers: [LivekitService],
  exports: [LivekitService],
})
export class LivekitModule {}
