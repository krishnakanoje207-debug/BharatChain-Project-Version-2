import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { CurrentUser } from "./current-user.decorator";
import { TokenService, JwtPayload } from "./token.service";
import { RateLimitService } from "../common/rate-limit.service";
import {
  ForgotPasswordDto,
  LoginDto,
  LogoutDto,
  RefreshDto,
  ResetPasswordDto,
  SignupDto,
  VerifyOtpDto,
} from "./dto/auth.dto";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly rate: RateLimitService,
  ) {}

  /** Throttle OTP-issuing endpoints so a phone can't be spammed. */
  private async throttleOtp(phone: string): Promise<void> {
    if (!(await this.rate.allow("otp", phone, 5, 600))) {
      throw new HttpException(
        "Too many requests. Please wait a few minutes and try again.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Throttle OTP-VERIFYING endpoints so a 6-digit code can't be brute-forced
   * within its 5-min TTL (10 tries per 10 min per phone — well below 10^6).
   */
  private async throttleOtpVerify(phone: string): Promise<void> {
    if (!(await this.rate.allow("otp-verify", phone, 10, 600))) {
      throw new HttpException(
        "Too many verification attempts. Please request a new code and try again shortly.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  @Post("signup")
  async signup(@Body() dto: SignupDto) {
    await this.throttleOtp(dto.phone);
    return this.auth.signup(dto);
  }

  @Post("verify-otp")
  @HttpCode(200)
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    await this.throttleOtpVerify(dto.phone);
    return this.auth.verifyOtp(dto.phone, dto.code);
  }

  @Post("login")
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.phone, dto.password);
  }

  @Post("refresh")
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post("forgot-password")
  @HttpCode(200)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.throttleOtp(dto.phone);
    return this.auth.forgotPassword(dto.phone);
  }

  @Post("reset-password")
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.throttleOtpVerify(dto.phone);
    await this.auth.resetPassword(dto.phone, dto.code, dto.newPassword);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post("heartbeat")
  @HttpCode(200)
  async heartbeat(@CurrentUser() user: JwtPayload) {
    const alive = await this.tokens.heartbeat(user.sid);
    if (!alive) throw new HttpException("Session expired.", HttpStatus.UNAUTHORIZED);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post("logout")
  @HttpCode(200)
  async logout(@CurrentUser() user: JwtPayload, @Body() dto: LogoutDto) {
    await this.auth.logout(user.sid, dto.refreshToken);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@CurrentUser() user: JwtPayload) {
    return this.auth.me(user.sub);
  }
}
