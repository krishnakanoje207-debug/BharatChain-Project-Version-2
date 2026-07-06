import { IsObject, IsOptional, IsString, Matches } from "class-validator";

export class CreateRedemptionDto {
  /** Vendor's on-chain address (the vendor whose DELIVERED value is being redeemed). */
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{40}$/, { message: "vendorAddress must be a 20-byte hex address" })
  vendorAddress!: string;

  /** Amount in rupees (e₹) to redeem, decimal string. */
  @IsString()
  @Matches(/^\d+(\.\d{1,18})?$/, { message: "amount must be a positive decimal in rupees" })
  amount!: string;

  /** Vendor's ITR / tax filing reference (legitimacy evidence reviewed by the RBI). */
  @IsOptional()
  @IsString()
  itrNumber?: string;

  /** Settlement bank account for the (simulated) fiat payout. */
  @IsOptional()
  @IsString()
  bankAccount?: string;

  /** Any additional legitimacy evidence (GSTIN, turnover, invoices, …). */
  @IsOptional()
  @IsObject()
  legitimacy?: Record<string, unknown>;
}

/** Vendor self-service redemption — the vendor address is derived from the caller. */
export class CreateSelfRedemptionDto {
  /** Amount in rupees (e₹) to redeem, decimal string. */
  @IsString()
  @Matches(/^\d+(\.\d{1,18})?$/, { message: "amount must be a positive decimal in rupees" })
  amount!: string;

  @IsOptional()
  @IsString()
  itrNumber?: string;

  @IsOptional()
  @IsString()
  bankAccount?: string;

  @IsOptional()
  @IsObject()
  legitimacy?: Record<string, unknown>;
}

export class RejectRedemptionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
