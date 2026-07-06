import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/** Vendor self-service onboarding request — declare a registered business. */
export class CreateVendorApplicationDto {
  @IsString() @MinLength(3) @MaxLength(120) businessName!: string;

  /** Government business-registry id, must match the declared business. */
  @IsString() @MinLength(3) @MaxLength(40) businessId!: string;
}

export class RejectVendorApplicationDto {
  @IsOptional() @IsString() @MaxLength(240) reason?: string;
}
