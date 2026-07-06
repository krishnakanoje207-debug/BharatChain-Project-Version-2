import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SchemeCache } from "../entities";
import { AuthModule } from "../auth/auth.module";
import { SchemesService } from "./schemes.service";
import { SchemesController } from "./schemes.controller";

@Module({
  imports: [TypeOrmModule.forFeature([SchemeCache]), AuthModule],
  controllers: [SchemesController],
  providers: [SchemesService],
  exports: [SchemesService],
})
export class SchemesModule {}
