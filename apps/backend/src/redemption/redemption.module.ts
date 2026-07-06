import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Redemption, User, Vendor } from "../entities";
import { AuthModule } from "../auth/auth.module";
import { RedemptionService } from "./redemption.service";
import { RedemptionController } from "./redemption.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([Redemption, Vendor, User]),
    AuthModule, // JwtAuthGuard + RolesGuard
  ],
  controllers: [RedemptionController],
  providers: [RedemptionService],
  exports: [RedemptionService],
})
export class RedemptionModule {}
