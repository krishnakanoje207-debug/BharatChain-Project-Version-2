import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Application, DisbursementRound } from "../entities";
import { SchemesModule } from "../schemes/schemes.module";
import { AuthModule } from "../auth/auth.module";
import { DisbursementService } from "./disbursement.service";
import { DisbursementController } from "./disbursement.controller";
import { DisbursementCron } from "./disbursement.cron";

@Module({
  imports: [
    TypeOrmModule.forFeature([Application, DisbursementRound]),
    SchemesModule,
    AuthModule, // JwtAuthGuard + RolesGuard
  ],
  controllers: [DisbursementController],
  providers: [DisbursementService, DisbursementCron],
  exports: [DisbursementService],
})
export class DisbursementModule {}
