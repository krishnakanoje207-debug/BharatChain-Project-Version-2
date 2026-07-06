import { Inject, Injectable } from "@nestjs/common";
import type Redis from "ioredis";
import { REDIS } from "../redis/redis.module";
import { RedisKeys } from "../common/redis-keys";

const MAX_FAILS = 5;
const FAIL_WINDOW_SECONDS = 900; // 15 min rolling window to accumulate failures
const LOCK_SECONDS = 900; // 15 min lock once tripped

/**
 * Login lockout (per the decision: hard error + lockout instead of a page
 * refresh on bad credentials). Counts failures in a rolling window and locks
 * the account once the threshold is hit. All state is in Redis with TTLs.
 */
@Injectable()
export class LockoutService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** Seconds remaining on an active lock, or 0 if not locked. */
  async lockedFor(phone: string): Promise<number> {
    const ttl = await this.redis.ttl(RedisKeys.lock(phone));
    return ttl > 0 ? ttl : 0;
  }

  /** Record a failed attempt; locks the account when the threshold is reached. */
  async recordFailure(phone: string): Promise<{ locked: boolean; remaining: number }> {
    const key = RedisKeys.loginFails(phone);
    const fails = await this.redis.incr(key);
    if (fails === 1) await this.redis.expire(key, FAIL_WINDOW_SECONDS);
    if (fails >= MAX_FAILS) {
      await this.redis.set(RedisKeys.lock(phone), "1", "EX", LOCK_SECONDS);
      await this.redis.del(key);
      return { locked: true, remaining: 0 };
    }
    return { locked: false, remaining: MAX_FAILS - fails };
  }

  /** Clear failure/lock state after a successful login. */
  async reset(phone: string): Promise<void> {
    await this.redis.del(RedisKeys.loginFails(phone), RedisKeys.lock(phone));
  }
}
