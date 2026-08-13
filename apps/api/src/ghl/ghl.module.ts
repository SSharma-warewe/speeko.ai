import { Global, Module, forwardRef } from '@nestjs/common';
import { CallsModule } from '../calls/calls.module';
import { GhlCalendarToolsService } from './ghl-calendar-tools.service';
import { GhlService } from './ghl.service';
import { InternalGhlCalendarController } from './internal-ghl-calendar.controller';

/**
 * GoHighLevel adapter: CRM upsert + platform calendar tools.
 * Calendar HTTP stays in GhlService; worker routes are secret-guarded.
 */
@Global()
@Module({
  imports: [forwardRef(() => CallsModule)],
  controllers: [InternalGhlCalendarController],
  providers: [GhlService, GhlCalendarToolsService],
  exports: [GhlService],
})
export class GhlModule {}
