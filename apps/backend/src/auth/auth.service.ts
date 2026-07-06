import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as bcrypt from "bcryptjs";
import { dataSlice, getAddress, id as keccakId } from "ethers";
import { Role } from "@bharatchain/shared";
import { User } from "../entities";
import { OtpService } from "./otp.service";
import { TokenService, IssuedTokens } from "./token.service";
import { LockoutService } from "./lockout.service";
import { AuditService } from "../audit/audit.service";

const SIGNUP = "signup";
const RESET = "reset";

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly lockout: LockoutService,
    private readonly audit: AuditService,
  ) {}

  /** Deterministic on-chain identifier for a keyless citizen (relayer signs). */
  private static chainAddressFor(userId: string): string {
    return getAddress(dataSlice(keccakId(userId), 12));
  }

  /** Start signup: create/refresh an unverified user and send a signup OTP. */
  async signup(dto: {
    phone: string;
    password: string;
    fullName?: string;
    email?: string;
    role?: "CITIZEN" | "VENDOR";
  }): Promise<{ devCode?: string }> {
    const existing = await this.users.findOne({ where: { phone: dto.phone } });
    if (existing?.phoneVerified) {
      throw new ConflictException("An account with this phone already exists. Please log in.");
    }
    const role = dto.role === "VENDOR" ? Role.VENDOR : Role.CITIZEN;
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user =
      existing ??
      this.users.create({ phone: dto.phone, passwordHash, role });
    user.role = role;
    user.passwordHash = passwordHash;
    user.fullName = dto.fullName ?? user.fullName;
    user.email = dto.email ?? user.email;
    await this.users.save(user);
    const devCode = await this.otp.issue(SIGNUP, dto.phone);
    await this.audit.log(user.id, "signup.requested", { entityType: "user", entityId: user.id });
    return { devCode };
  }

  /** Complete signup: verify the OTP, assign the chain address, issue tokens. */
  async verifyOtp(phone: string, code: string): Promise<{ tokens: IssuedTokens; user: PublicUser }> {
    if (!(await this.otp.verify(SIGNUP, phone, code))) {
      throw new UnauthorizedException("Invalid or expired code.");
    }
    const user = await this.users.findOneOrFail({ where: { phone } });
    user.phoneVerified = true;
    if (!user.chainAddress) user.chainAddress = AuthService.chainAddressFor(user.id);
    await this.users.save(user);
    const tokens = await this.tokens.issue(user.id, user.role);
    await this.audit.log(user.id, "signup.verified", { entityType: "user", entityId: user.id });
    return { tokens, user: toPublicUser(user) };
  }

  async login(phone: string, password: string): Promise<{ tokens: IssuedTokens; user: PublicUser }> {
    const locked = await this.lockout.lockedFor(phone);
    if (locked > 0) {
      throw new HttpException(
        `Account locked due to repeated failed attempts. Try again in ${Math.ceil(locked / 60)} min.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const user = await this.users.findOne({ where: { phone } });
    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!user || !ok) {
      const res = await this.lockout.recordFailure(phone);
      await this.audit.log(user?.id ?? phone, "login.failed", { entityType: "user", entityId: user?.id });
      throw new UnauthorizedException(
        res.locked
          ? "Too many failed attempts — account locked for 15 minutes."
          : `Incorrect phone or password. ${res.remaining} attempt(s) left before lockout.`,
      );
    }
    if (!user.phoneVerified) {
      throw new ForbiddenException("Phone not verified. Please complete signup verification.");
    }
    await this.lockout.reset(phone);
    const tokens = await this.tokens.issue(user.id, user.role);
    await this.audit.log(user.id, "login.success", { entityType: "user", entityId: user.id });
    return { tokens, user: toPublicUser(user) };
  }

  async refresh(refreshToken: string): Promise<IssuedTokens> {
    const rotated = await this.tokens.rotate(refreshToken);
    if (!rotated) throw new UnauthorizedException("Session expired. Please log in again.");
    const { userId: _userId, ...tokens } = rotated;
    void _userId;
    return tokens;
  }

  async logout(sid: string, refreshToken?: string): Promise<void> {
    await this.tokens.revoke(sid, refreshToken);
  }

  /** Always returns ok (don't leak account existence); sends OTP if user exists. */
  async forgotPassword(phone: string): Promise<{ devCode?: string }> {
    const user = await this.users.findOne({ where: { phone } });
    if (!user) return {};
    const devCode = await this.otp.issue(RESET, phone);
    await this.audit.log(user.id, "password.reset_requested", { entityType: "user", entityId: user.id });
    return { devCode };
  }

  async resetPassword(phone: string, code: string, newPassword: string): Promise<void> {
    if (!(await this.otp.verify(RESET, phone, code))) {
      throw new UnauthorizedException("Invalid or expired code.");
    }
    const user = await this.users.findOneOrFail({ where: { phone } });
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await this.users.save(user);
    await this.lockout.reset(phone);
    await this.audit.log(user.id, "password.reset", { entityType: "user", entityId: user.id });
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.users.findOneOrFail({ where: { id: userId } });
    return toPublicUser(user);
  }
}

export interface PublicUser {
  id: string;
  phone: string;
  fullName?: string;
  email?: string;
  role: Role;
  chainAddress?: string;
}

function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    phone: u.phone,
    fullName: u.fullName,
    email: u.email,
    role: u.role,
    chainAddress: u.chainAddress,
  };
}
