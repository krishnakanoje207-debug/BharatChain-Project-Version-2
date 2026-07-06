import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Anomaly, Payment, User } from "../entities";
import { AuthModule } from "../auth/auth.module";
import { AnomalyService } from "./anomaly.service";
import { AnomalyController } from "./anomaly.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([Anomaly, Payment, User]),
    AuthModule, // JwtAuthGuard + RolesGuard
  ],
  controllers: [AnomalyController],
  providers: [AnomalyService],
  exports: [AnomalyService],
})
export class AnomalyModule {}
