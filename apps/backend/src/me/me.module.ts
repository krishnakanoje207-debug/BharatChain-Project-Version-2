import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Application, User } from "../entities";
import { SchemesModule } from "../schemes/schemes.module";
import { AuthModule } from "../auth/auth.module";
import { MeService } from "./me.service";
import { MeController } from "./me.controller";

@Module({
  imports: [TypeOrmModule.forFeature([User, Application]), SchemesModule, AuthModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
