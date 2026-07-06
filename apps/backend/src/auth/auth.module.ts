import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../entities";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { OtpService } from "./otp.service";
import { TokenService } from "./token.service";
import { LockoutService } from "./lockout.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { RolesGuard } from "./roles.guard";
import { RateLimitService } from "../common/rate-limit.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("JWT_SECRET", "change-me-dev-only"),
        signOptions: { expiresIn: config.get<string>("JWT_EXPIRES_IN", "15m") },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    TokenService,
    LockoutService,
    JwtAuthGuard,
    RolesGuard,
    RateLimitService,
  ],
  // Re-export so other modules can guard routes + read the authed user / session.
  exports: [TokenService, JwtAuthGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
