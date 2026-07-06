import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Min } from "class-validator";
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

  @IsOptional()
  kissan?: string;

  @IsOptional()
  land?: string;
}

export class UploadDocumentDto {
  @IsEnum(DocumentType)
  docType!: DocumentType;

  /** The unique id printed on the document (matched against the registry). */
  @IsString()
  @IsNotEmpty()
  declaredId!: string;
}
