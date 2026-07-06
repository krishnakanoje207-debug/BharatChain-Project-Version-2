import { Global, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import Redis from "ioredis";

export const REDIS = Symbol("REDIS");

/**
 * Single shared ioredis client (sessions, OTP codes, refresh tokens, rate-limit,
 * login lockout). Global so any module can inject `@Inject(REDIS)`.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>("REDIS_URL");
        return url
          ? new Redis(url)
          : new Redis({
              host: config.get<string>("REDIS_HOST", "localhost"),
              port: Number(config.get<string>("REDIS_PORT", "6379")),
            });
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule {}
