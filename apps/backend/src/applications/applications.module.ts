import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Application, ApplicationDocument, User } from "../entities";
import { SchemesModule } from "../schemes/schemes.module";
import { AuthModule } from "../auth/auth.module";
import { ApplicationsService } from "./applications.service";
import { ApplicationsController } from "./applications.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([Application, ApplicationDocument, User]),
    SchemesModule,
    AuthModule, // JwtAuthGuard + TokenService
  ],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
})
export class ApplicationsModule {}
