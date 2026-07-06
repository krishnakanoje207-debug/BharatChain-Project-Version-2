import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Role } from "@bharatchain/shared";
import { ROLES_KEY } from "./roles.decorator";
import type { JwtPayload } from "./token.service";

/**
 * Checks the authenticated user's role against @Roles(...). Runs after
 * JwtAuthGuard (which populates req.user). No metadata → route is open to any
 * authenticated user.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const user = ctx.switchToHttp().getRequest<{ user?: JwtPayload }>().user;
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException("You do not have permission to perform this action.");
    }
    return true;
  }
}
