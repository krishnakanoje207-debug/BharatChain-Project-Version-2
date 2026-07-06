import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { randomBytes, randomUUID } from "node:crypto";
import type Redis from "ioredis";
import { REDIS } from "../redis/redis.module";
import { RedisKeys } from "../common/redis-keys";
import type { Role } from "@bharatchain/shared";

export interface JwtPayload {
  sub: string; // user id
  role: Role;
  sid: string; // session id (heartbeat-tracked)
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

/**
 * Tokens + sessions, Redis-backed.
 *  - Access token: short-lived JWT carrying { sub, role, sid }.
 *  - Refresh token: opaque random string -> session, rotated on use (7d).
 *  - Session: heartbeat-tracked with a sliding TTL; when heartbeats stop the
 *    session expires and the guard rejects the (otherwise valid) access token,
 *    giving server-side auto-logout.
 */
@Injectable()
export class TokenService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private get refreshTtl(): number {
    return this.parseDuration(this.config.get<string>("REFRESH_EXPIRES_IN", "7d"));
  }

  private get heartbeatTtl(): number {
    return Number(this.config.get<string>("SESSION_HEARTBEAT_TIMEOUT_SECONDS", "60"));
  }

  async issue(userId: string, role: Role): Promise<IssuedTokens> {
    const sid = randomUUID();
    await this.touchSession(sid, userId);
    return this.signFor(userId, role, sid);
  }

  /** Validate + rotate a refresh token, keeping the same session. */
  async rotate(refreshToken: string): Promise<(IssuedTokens & { userId: string }) | null> {
    const raw = await this.redis.get(RedisKeys.refresh(refreshToken));
    if (!raw) return null;
    const { userId, role, sid } = JSON.parse(raw) as { userId: string; role: Role; sid: string };
    await this.redis.del(RedisKeys.refresh(refreshToken));
    if (!(await this.sessionAlive(sid))) return null;
    const tokens = await this.signFor(userId, role, sid);
    return { ...tokens, userId };
  }

  /** Refresh the session TTL (heartbeat). Returns false if the session is gone. */
  async heartbeat(sid: string): Promise<boolean> {
    const key = RedisKeys.session(sid);
    if (!(await this.redis.exists(key))) return false;
    await this.redis.expire(key, this.heartbeatTtl);
    return true;
  }

  async sessionAlive(sid: string): Promise<boolean> {
    return (await this.redis.exists(RedisKeys.session(sid))) === 1;
  }

  async revoke(sid: string, refreshToken?: string): Promise<void> {
    await this.redis.del(RedisKeys.session(sid));
    if (refreshToken) await this.redis.del(RedisKeys.refresh(refreshToken));
  }

  private async touchSession(sid: string, userId: string): Promise<void> {
    await this.redis.set(RedisKeys.session(sid), userId, "EX", this.heartbeatTtl);
  }

  private async signFor(userId: string, role: Role, sid: string): Promise<IssuedTokens> {
    const payload: JwtPayload = { sub: userId, role, sid };
    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = randomBytes(48).toString("hex");
    await this.redis.set(
      RedisKeys.refresh(refreshToken),
      JSON.stringify({ userId, role, sid }),
      "EX",
      this.refreshTtl,
    );
    return { accessToken, refreshToken, expiresIn: this.config.get("JWT_EXPIRES_IN", "15m") };
  }

  private parseDuration(s: string): number {
    const m = /^(\d+)([smhd])$/.exec(s.trim());
    if (!m) return Number(s) || 0;
    const n = Number(m[1]);
    return n * { s: 1, m: 60, h: 3600, d: 86400 }[m[2] as "s" | "m" | "h" | "d"];
  }
}
