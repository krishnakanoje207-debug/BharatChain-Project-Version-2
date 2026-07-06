import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { JwtPayload } from "./token.service";

/** Injects the authenticated JWT payload ({ sub, role, sid }) into a handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    return ctx.switchToHttp().getRequest().user;
  },
);
