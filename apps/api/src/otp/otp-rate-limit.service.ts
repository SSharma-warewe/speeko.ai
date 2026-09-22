import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FixedWindowRateLimit } from '../common/fixed-window-rate-limit';
import { throwTooManyRequests } from '../common/http-too-many-requests';

/**
 * In-process send/verify windows for public OTP routes.
 * Each API process keeps its own counters (same caveat as get-demo).
 */
@Injectable()
export class OtpRateLimitService {
  private readonly limiter = new FixedWindowRateLimit();

  readonly sendIpMax: number;
  readonly sendIpWindowMs: number;
  readonly sendPhoneMax: number;
  readonly sendPhoneWindowMs: number;
  readonly verifyIpMax: number;
  readonly verifyIpWindowMs: number;

  constructor(config: ConfigService) {
    this.sendIpMax = Number(
      config.get<string | number>('OTP_SEND_MAX_PER_IP', 8),
    );
    this.sendIpWindowMs = Number(
      config.get<string | number>('OTP_SEND_IP_WINDOW_MS', 15 * 60_000),
    );
    this.sendPhoneMax = Number(
      config.get<string | number>('OTP_SEND_MAX_PER_PHONE', 3),
    );
    this.sendPhoneWindowMs = Number(
      config.get<string | number>('OTP_SEND_PHONE_WINDOW_MS', 60 * 60_000),
    );
    this.verifyIpMax = Number(
      config.get<string | number>('OTP_VERIFY_MAX_PER_IP', 20),
    );
    this.verifyIpWindowMs = Number(
      config.get<string | number>('OTP_VERIFY_IP_WINDOW_MS', 15 * 60_000),
    );
  }

  consumeSend(ip: string, phoneDigits: string): void {
    const ipResult = this.limiter.consume(
      `otp-send:ip:${ip}`,
      this.sendIpMax,
      this.sendIpWindowMs,
    );
    if (!ipResult.allowed) {
      throwTooManyRequests('Too many codes. Try again later.');
    }

    if (phoneDigits.length < 7) {
      return;
    }

    const phoneResult = this.limiter.consume(
      `otp-send:phone:${phoneDigits}`,
      this.sendPhoneMax,
      this.sendPhoneWindowMs,
    );
    if (!phoneResult.allowed) {
      throwTooManyRequests('Too many codes. Try again later.');
    }
  }

  consumeVerify(ip: string): void {
    const result = this.limiter.consume(
      `otp-verify:ip:${ip}`,
      this.verifyIpMax,
      this.verifyIpWindowMs,
    );
    if (!result.allowed) {
      throwTooManyRequests('Too many attempts. Try again later.');
    }
  }
}
