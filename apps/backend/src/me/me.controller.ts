import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtPayload } from "../auth/token.service";
import { MeService } from "./me.service";
import { NotificationService } from "../notifications/notification.service";

/** Citizen self-service: entitlements + notifications. */
@UseGuards(JwtAuthGuard)
@Controller("me")
export class MeController {
  constructor(
    private readonly me: MeService,
    private readonly notifications: NotificationService,
  ) {}

  @Get("entitlements")
  entitlements(@CurrentUser() user: JwtPayload) {
    return this.me.entitlements(user.sub);
  }

  @Get("notifications")
  listNotifications(@CurrentUser() user: JwtPayload) {
    return this.notifications.list(user.sub);
  }

  @Post("notifications/:id/read")
  async markRead(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await this.notifications.markRead(user.sub, id);
    return { ok: true };
  }
}
