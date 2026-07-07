import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Min } from "class-validator";
import { Type } from "class-transformer";
import { DocumentType } from "../../entities";

const PAN = /^[A-Z]{5}\d{4}[A-Z]$/i;

export class CreateApplicationDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  schemeId!: number;

  @Matches(PAN, { message: "pan must be a valid PAN (e.g. ABCDE1234F)" })
  pan!: string;

  // Agriculture (PM-Kisan) declarations — cross-checked against the registry when supplied.
  @IsOptional()
  kissan?: string;

  @IsOptional()
  land?: string;

  // Education (Post-Matric scholarship) declarations: caste category code (0 General,
  // 1 SC, 2 ST, 3 OBC, 4 EBC, 5 Minority) and current student status.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  caste?: number;

  @IsOptional()
  @IsBoolean()
  isStudent?: boolean;

  // Housing (PMAY-Gramin) declaration: house status code (0 adequate, 1 kutcha, 2 houseless).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  houseStatus?: number;
}

export class UploadDocumentDto {
  @IsEnum(DocumentType)
  docType!: DocumentType;

  /** The unique id printed on the document (matched against the registry). */
  @IsString()
  @IsNotEmpty()
  declaredId!: string;
}
