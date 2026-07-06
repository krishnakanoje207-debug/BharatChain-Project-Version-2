import { Module } from "@nestjs/common";
import { SchemesModule } from "../schemes/schemes.module";
import { AuthModule } from "../auth/auth.module";
import { AssistantService } from "./assistant.service";
import { AssistantController } from "./assistant.controller";
import { LlmService } from "./llm.service";
import { BhashiniService } from "./bhashini.service";
import { RateLimitService } from "../common/rate-limit.service";

@Module({
  imports: [
    SchemesModule, // SchemesService for the schemes catalog
    AuthModule, // JwtAuthGuard + RolesGuard
  ],
  controllers: [AssistantController],
  providers: [AssistantService, LlmService, BhashiniService, RateLimitService],
  exports: [AssistantService],
})
export class AssistantModule {}
