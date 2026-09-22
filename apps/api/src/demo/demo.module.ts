import { Module } from '@nestjs/common';
import { OtpModule } from '../otp/otp.module';
import { DemoController } from './demo.controller';
import { DemoRateLimitService } from './demo-rate-limit.service';
import { DemoService } from './demo.service';
import { DemoAbuseGuard } from './guards/demo-abuse.guard';

@Module({
  imports: [OtpModule],
  controllers: [DemoController],
  providers: [DemoService, DemoRateLimitService, DemoAbuseGuard],
})
export class DemoModule {}
