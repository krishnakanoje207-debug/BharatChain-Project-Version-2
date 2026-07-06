import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Role, RedemptionStatus } from "@bharatchain/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtPayload } from "../auth/token.service";
import { RedemptionService } from "./redemption.service";
import { CreateRedemptionDto, CreateSelfRedemptionDto, RejectRedemptionDto } from "./dto/redemption.dto";

/**
 * Vendor e₹→fiat redemption. ADMIN files a vendor's request (relayer, with ITR/legitimacy
 * capture); the RBI reviews and approves (burn + simulated payout) or rejects.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("redemptions")
export class RedemptionController {
  constructor(private readonly redemption: RedemptionService) {}

  @Post()
  @Roles(Role.ADMIN, Role.RBI_ADMIN)
  request(@CurrentUser() user: JwtPayload, @Body() dto: CreateRedemptionDto) {
    return this.redemption.request(user.sub, dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.RBI_ADMIN)
  list(@Query("status") status?: RedemptionStatus, @Query("vendor") vendor?: string) {
    return this.redemption.list({ status, vendor });
  }

  /** Vendor: file a redemption for their own delivered value. */
  @Post("mine")
  @Roles(Role.VENDOR)
  requestMine(@CurrentUser() user: JwtPayload, @Body() dto: CreateSelfRedemptionDto) {
    return this.redemption.requestSelf(user.sub, dto);
  }

  /** Vendor: their own redemption history (declared before `:id`). */
  @Get("mine")
  @Roles(Role.VENDOR)
  listMine(@CurrentUser() user: JwtPayload) {
    return this.redemption.listMine(user.sub);
  }

  /** Vendor: how much delivered value they may currently redeem. */
  @Get("redeemable")
  @Roles(Role.VENDOR)
  redeemable(@CurrentUser() user: JwtPayload) {
    return this.redemption.redeemableFor(user.sub);
  }

  @Get(":id")
  @Roles(Role.ADMIN, Role.RBI_ADMIN)
  getOne(@Param("id") id: string) {
    return this.redemption.getOne(id);
  }

  @Post(":id/approve")
  @Roles(Role.RBI_ADMIN)
  approve(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.redemption.approve(user.sub, id);
  }

  @Post(":id/reject")
  @Roles(Role.RBI_ADMIN)
  reject(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: RejectRedemptionDto) {
    return this.redemption.reject(user.sub, id, dto.reason);
  }
}
