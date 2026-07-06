import { IsInt, IsString, Matches, Min } from "class-validator";
import { Type } from "class-transformer";

export class CreatePaymentDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  schemeId!: number;

  /** Approved vendor's on-chain address. */
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{40}$/, { message: "vendorAddress must be a 20-byte hex address" })
  vendorAddress!: string;

  /** Amount in rupees (e₹), decimal string e.g. "5000" or "1499.50". */
  @IsString()
  @Matches(/^\d+(\.\d{1,18})?$/, { message: "amount must be a positive decimal in rupees" })
  amount!: string;
}
