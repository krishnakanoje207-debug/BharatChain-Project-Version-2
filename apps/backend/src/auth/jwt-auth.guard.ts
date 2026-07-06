import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { TokenService, JwtPayload } from "./token.service";

/**
 * Validates the access JWT AND that the heartbeat session is still alive.
 * A valid-but-stale token (heartbeats stopped) is rejected → auto-logout.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token.");
    }
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(header.slice(7));
    } catch {
      throw new UnauthorizedException("Invalid or expired token.");
    }
    if (!(await this.tokens.sessionAlive(payload.sid))) {
      throw new UnauthorizedException("Session timed out. Please log in again.");
    }
    req.user = payload;
    return true;
  }
}
