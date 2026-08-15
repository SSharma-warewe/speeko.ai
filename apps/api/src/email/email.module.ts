import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';

/**
 * Plunk-backed transactional email adapter.
 * Infrastructure only — no HTTP controllers. Inject EmailService elsewhere.
 */
@Global()
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
