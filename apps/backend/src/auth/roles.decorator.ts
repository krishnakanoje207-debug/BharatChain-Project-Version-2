import { SetMetadata } from "@nestjs/common";
import type { Role } from "@bharatchain/shared";

export const ROLES_KEY = "roles";

/** Restrict a route to the given app roles. Use together with JwtAuthGuard + RolesGuard. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
