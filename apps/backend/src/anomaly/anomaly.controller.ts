import { Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { AnomalyStatus, Role } from "@bharatchain/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtPayload } from "../auth/token.service";
import { AnomalyService } from "./anomaly.service";

/** Admin/RBI fraud-monitoring surface (Kafka-fed anomaly signals). */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.RBI_ADMIN)
@Controller("anomalies")
export class AnomalyController {
  constructor(private readonly anomalies: AnomalyService) {}

  @Get()
  list(@Query("status") status?: AnomalyStatus) {
    return this.anomalies.list(status);
  }

  @Post(":id/resolve")
  resolve(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.anomalies.resolve(id, user.sub);
  }
}
