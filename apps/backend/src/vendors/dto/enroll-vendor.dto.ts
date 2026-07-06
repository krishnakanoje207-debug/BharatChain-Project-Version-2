import { IsInt, IsOptional, Min } from "class-validator";
import { Type } from "class-transformer";

export class EnrollVendorDto {
  /** Target scheme; omit to enroll the vendor into every scheme its category is allowed for. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  schemeId?: number;
}
