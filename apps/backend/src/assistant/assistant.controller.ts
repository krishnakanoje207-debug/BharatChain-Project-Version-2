import { Body, Controller, Get, HttpException, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { Role } from "@bharatchain/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtPayload } from "../auth/token.service";
import { RateLimitService } from "../common/rate-limit.service";
import { AssistantService } from "./assistant.service";
import { LANGUAGES } from "./bhashini.service";
import { ChatDto } from "./dto/assistant.dto";

/**
 * AI assistant, two surfaces:
 *  - PUBLIC (anonymous): platform/scheme/registration questions only — zero
 *    personal data on this path, IP rate-limited.
 *  - PERSONAL (signed-in CITIZEN only): multilingual chat grounded in the
 *    citizen's own data.
 */
@Controller("assistant")
export class AssistantController {
  constructor(
    private readonly assistant: AssistantService,
    private readonly rate: RateLimitService,
  ) {}

  // ------------------------------------------------------------------ public

  /** Anonymous visitor chat — public info only (schemes, how-it-works, registration). */
  @Post("public/chat")
  async publicChat(@Req() req: Request, @Body() dto: ChatDto) {
    const ip = req.ip ?? "unknown";
    if (!(await this.rate.allow("assistant-public", ip, 20, 300))) {
      throw new HttpException("Too many questions — please wait a moment and try again.", HttpStatus.TOO_MANY_REQUESTS);
    }
    return this.assistant.publicChat(dto.message, dto.language ?? "en");
  }

  @Get("public/suggestions")
  publicSuggestions() {
    return { suggestions: this.assistant.publicSuggestions() };
  }

  /** Languages the assistant can reply in. */
  @Get("languages")
  languages() {
    return Object.entries(LANGUAGES).map(([code, name]) => ({ code, name }));
  }

  // ---------------------------------------------------- personal (citizen only)

  /** Personal chat grounded in the citizen's own data — signed-in citizens only. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CITIZEN)
  @Post("chat")
  chat(@CurrentUser() user: JwtPayload, @Body() dto: ChatDto) {
    return this.assistant.chat(user.sub, dto.message, dto.language ?? "en");
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CITIZEN)
  @Get("suggestions")
  suggestions() {
    return { suggestions: this.assistant.suggestions() };
  }
}
