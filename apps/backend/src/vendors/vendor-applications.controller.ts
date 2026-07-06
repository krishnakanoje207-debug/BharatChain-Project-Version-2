import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Role } from "@bharatchain/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtPayload } from "../auth/token.service";
import { VendorApplicationStatus } from "../entities";
import { VendorApplicationsService } from "./vendor-applications.service";
import { CreateVendorApplicationDto, RejectVendorApplicationDto } from "./dto/vendor-application.dto";

@UseGuards(JwtAuthGuard)
@Controller("vendor-applications")
export class VendorApplicationsController {
  constructor(private readonly applications: VendorApplicationsService) {}

  /** Vendor: submit an onboarding request (declares a registered business). */
  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.VENDOR)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateVendorApplicationDto) {
    return this.applications.create(user.sub, dto);
  }

  /** Vendor: the status of their own application(s). */
  @Get("mine")
  @UseGuards(RolesGuard)
  @Roles(Role.VENDOR)
  mine(@CurrentUser() user: JwtPayload) {
    return this.applications.listMine(user.sub);
  }

  /** Admin: list vendor applications (optionally only PENDING). */
  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  listAll(@Query("status") status?: VendorApplicationStatus) {
    return this.applications.listAll(status);
  }

  /** Admin: approve — register + ZK-enrol the vendor on-chain. */
  @Post(":id/approve")
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  approve(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.applications.approve(id, user.sub);
  }

  /** Admin: reject a pending application. */
  @Post(":id/reject")
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  reject(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: RejectVendorApplicationDto) {
    return this.applications.rejectById(id, user.sub, dto?.reason);
  }
}
