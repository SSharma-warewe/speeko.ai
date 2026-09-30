import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OtpAbuseGuard } from './guards/otp-abuse.guard';
import { OtpChallenge } from './otp-challenge.entity';
import { OtpChallengesRepository } from './otp-challenges.repository';
import { OtpController } from './otp.controller';
import { OtpRateLimitService } from './otp-rate-limit.service';
import { OtpService } from './otp.service';
import { WhatsAppHarnessModule } from '../whatsapp-harness/whatsapp-harness.module';

@Module({
  imports: [TypeOrmModule.forFeature([OtpChallenge]), WhatsAppHarnessModule],
  controllers: [OtpController],
  providers: [
    OtpChallengesRepository,
    OtpService,
    OtpRateLimitService,
    OtpAbuseGuard,
  ],
  exports: [OtpService],
})
export class OtpModule {}
