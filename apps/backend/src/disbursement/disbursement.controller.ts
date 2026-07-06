import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Role } from "@bharatchain/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtPayload } from "../auth/token.service";
import { DisbursementService } from "./disbursement.service";
import { CreateRoundDto } from "./dto/disbursement.dto";

/** Admin/RBI-triggered disbursal. Cron will call the service directly (Part 2). */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.RBI_ADMIN)
@Controller("disbursement")
export class DisbursementController {
  constructor(private readonly disbursement: DisbursementService) {}

  /** Open + distribute an installment for a scheme's enrolled beneficiaries. */
  @Post("rounds")
  createRound(@CurrentUser() user: JwtPayload, @Body() dto: CreateRoundDto) {
    return this.disbursement.runRound(dto.schemeId, user.sub);
  }

  @Get("rounds")
  list(@Query("schemeId") schemeId?: string) {
    return this.disbursement.listRounds(schemeId !== undefined ? Number(schemeId) : undefined);
  }

  @Get("rounds/:id")
  getOne(@Param("id") id: string) {
    return this.disbursement.getRound(id);
  }
}
