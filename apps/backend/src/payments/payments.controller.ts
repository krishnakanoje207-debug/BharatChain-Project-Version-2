import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtPayload } from "../auth/token.service";
import { PaymentsService } from "./payments.service";
import { CreatePaymentDto } from "./dto/payment.dto";

/** Citizen payment rail: spend a scheme entitlement at an approved vendor, then confirm delivery. */
@UseGuards(JwtAuthGuard)
@Controller("payments")
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  pay(@CurrentUser() user: JwtPayload, @Body() dto: CreatePaymentDto) {
    return this.payments.pay(user.sub, dto.schemeId, dto.vendorAddress, dto.amount);
  }

  @Post(":id/confirm")
  confirm(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.payments.confirmDelivery(user.sub, id);
  }

  @Get()
  listMine(@CurrentUser() user: JwtPayload) {
    return this.payments.listMine(user.sub);
  }

  @Get(":id")
  getOne(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.payments.getOne(user.sub, id);
  }
}
