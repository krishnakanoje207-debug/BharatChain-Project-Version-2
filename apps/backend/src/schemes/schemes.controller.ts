import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Role, SchemeCategory } from "@bharatchain/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { SchemesService } from "./schemes.service";
import { CreateSchemeDto, UpdateSchemeDto } from "./dto/scheme.dto";

/** Public scheme browse (GET, no auth) + admin scheme management (POST/PATCH). */
@Controller("schemes")
export class SchemesController {
  constructor(private readonly schemes: SchemesService) {}

  /** Admin: create a new scheme on-chain. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateSchemeDto) {
    return this.schemes.create(dto);
  }

  /** Admin: modify a scheme (activate/deactivate, top up the fund, edit metadata). */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(":id")
  update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateSchemeDto) {
    return this.schemes.update(id, dto);
  }

  /** Flat list of all schemes (on-chain truth + cached metadata). */
  @Get("all")
  all() {
    return this.schemes.listFromChain();
  }

  /** Browse active schemes grouped by category, with search + category filter. */
  @Get()
  browse(@Query("q") q?: string, @Query("category") category?: string) {
    let cat: SchemeCategory | undefined;
    if (category) {
      if (!(category in SchemeCategory)) {
        throw new BadRequestException(`Unknown category. One of: ${Object.keys(SchemeCategory).join(", ")}`);
      }
      cat = SchemeCategory[category as keyof typeof SchemeCategory];
    }
    return this.schemes.browse({ q, category: cat });
  }

  @Get(":id")
  getOne(@Param("id", ParseIntPipe) id: number) {
    return this.schemes.getOne(id);
  }
}
