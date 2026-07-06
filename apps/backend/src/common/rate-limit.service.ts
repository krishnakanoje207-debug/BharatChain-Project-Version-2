import { Inject, Injectable } from "@nestjs/common";
import type Redis from "ioredis";
import { REDIS } from "../redis/redis.module";
import { RedisKeys } from "./redis-keys";

/** Minimal fixed-window rate limiter (Redis INCR + EXPIRE). App-wide guardrail. */
@Injectable()
export class RateLimitService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** Returns true if allowed; false if the limit for this bucket+id was exceeded. */
  async allow(bucket: string, id: string, limit: number, windowSeconds: number): Promise<boolean> {
    const key = RedisKeys.rate(bucket, id);
    const n = await this.redis.incr(key);
    if (n === 1) await this.redis.expire(key, windowSeconds);
    return n <= limit;
  }
}
