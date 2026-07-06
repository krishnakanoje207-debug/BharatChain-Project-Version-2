import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { LANGUAGES } from "../bhashini.service";

export class ChatDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  message!: string;

  /** Reply language (ISO code). Defaults to English. */
  @IsOptional()
  @IsIn(Object.keys(LANGUAGES))
  language?: string;
}
