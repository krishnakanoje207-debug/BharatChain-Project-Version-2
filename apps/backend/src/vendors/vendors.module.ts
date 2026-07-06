import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User, Vendor, VendorApplication } from "../entities";
import { SchemesModule } from "../schemes/schemes.module";
import { AuthModule } from "../auth/auth.module";
import { VendorsService } from "./vendors.service";
import { VendorEnrollmentService } from "./vendor-enrollment.service";
import { VendorApplicationsService } from "./vendor-applications.service";
import { VendorsController } from "./vendors.controller";
import { VendorApplicationsController } from "./vendor-applications.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([Vendor, VendorApplication, User]),
    SchemesModule,
    AuthModule, // JwtAuthGuard
  ],
  controllers: [VendorsController, VendorApplicationsController],
  providers: [VendorsService, VendorEnrollmentService, VendorApplicationsService],
  exports: [VendorsService, VendorEnrollmentService],
})
export class VendorsModule {}
