import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Role } from "@bharatchain/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtPayload } from "../auth/token.service";
import { ApplicationsService } from "./applications.service";
import { CreateApplicationDto, UploadDocumentDto } from "./dto/application.dto";

@UseGuards(JwtAuthGuard)
@Controller("applications")
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  /** Step 1 — create application (scheme + PAN match against the registry). */
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateApplicationDto) {
    return this.applications.create(user.sub, dto);
  }

  /** Step 2 — upload a supporting document (multipart: file + docType + declaredId). */
  @Post(":id/documents")
  @UseInterceptors(
    // Cap in-memory upload size (5 MB) so a large body can't exhaust server memory.
    FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }),
  )
  uploadDocument(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
  ) {
    return this.applications.addDocument(user.sub, id, file, dto.docType, dto.declaredId);
  }

  /** Step 3 — prove eligibility (ZK) and enrol on-chain via the relayer. */
  @Post(":id/submit")
  submit(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.applications.submit(user.sub, id);
  }

  /** Admin/RBI: every application across all citizens. */
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.RBI_ADMIN)
  @Get()
  listAll() {
    return this.applications.listAll();
  }

  @Get("mine")
  mine(@CurrentUser() user: JwtPayload) {
    return this.applications.listMine(user.sub);
  }

  @Get(":id")
  getOne(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.applications.getOne(user.sub, id);
  }
}
