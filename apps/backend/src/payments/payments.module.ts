import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Payment, User, Vendor } from "../entities";
import { SchemesModule } from "../schemes/schemes.module";
import { AuthModule } from "../auth/auth.module";
import { PaymentsService } from "./payments.service";
import { PaymentsController } from "./payments.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, User, Vendor]),
    SchemesModule,
    AuthModule, // JwtAuthGuard
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
