import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomInt } from "node:crypto";
import type Redis from "ioredis";
import { REDIS } from "../redis/redis.module";
import { RedisKeys } from "../common/redis-keys";

const OTP_TTL_SECONDS = 300; // 5 minutes

/**
 * Simulated SMS OTP (no paid SMS gateway — per the $0 constraint). Codes are
 * stored in Redis with a TTL and "delivered" by logging to the console. In
 * non-production the generated code is returned to the caller so the demo UI
 * can display it; never do that in production.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  private get devMode(): boolean {
    return this.config.get<string>("NODE_ENV") !== "production";
  }

  /** Generate + store a 6-digit code. Returns the code only in dev mode. */
  async issue(purpose: string, phone: string): Promise<string | undefined> {
    // Cryptographically-secure RNG so the code can't be predicted from prior codes.
    const code = String(randomInt(100000, 1000000));
    await this.redis.set(RedisKeys.otp(purpose, phone), code, "EX", OTP_TTL_SECONDS);
    this.logger.log(`[SIMULATED SMS] OTP for ${phone} (${purpose}): ${code}`);
    return this.devMode ? code : undefined;
  }

  /** Verify + consume a code (single use). */
  async verify(purpose: string, phone: string, code: string): Promise<boolean> {
    const key = RedisKeys.otp(purpose, phone);
    const stored = await this.redis.get(key);
    if (!stored || stored !== code) return false;
    await this.redis.del(key);
    return true;
  }
}
