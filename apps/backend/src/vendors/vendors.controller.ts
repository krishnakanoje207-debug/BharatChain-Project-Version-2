import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Role, VendorCategory } from "@bharatchain/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { VendorsService } from "./vendors.service";
import { VendorEnrollmentService } from "./vendor-enrollment.service";
import { EnrollVendorDto } from "./dto/enroll-vendor.dto";

/** Citizen-facing directory of approved vendors to spend a scheme entitlement at. */
@UseGuards(JwtAuthGuard)
@Controller("vendors")
export class VendorsController {
  constructor(
    private readonly vendors: VendorsService,
    private readonly enrollment: VendorEnrollmentService,
  ) {}

  /**
   * List approved vendors. Pass `schemeId` to get only the vendors a citizen may
   * pay from that scheme, or `category` to filter by vendor category.
   */
  @Get()
  list(
    @Query("schemeId") schemeId?: string,
    @Query("category") category?: VendorCategory,
  ) {
    if (schemeId !== undefined) return this.vendors.listForScheme(Number(schemeId));
    return this.vendors.list(category);
  }

  /**
   * Admin/RBI: ZK-enroll an approved vendor into a scheme (proves business-registry eligibility and
   * relays the proof). Pass `schemeId` to target one scheme, or omit it to enroll the vendor into
   * every scheme its category is allowed for.
   */
  @Post(":address/enroll")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.RBI_ADMIN)
  enroll(@Param("address") address: string, @Body() dto: EnrollVendorDto) {
    if (dto?.schemeId !== undefined) return this.enrollment.enrollVendor(address, dto.schemeId);
    return this.enrollment.enrollVendorIntoMatchingSchemes(address);
  }
}
