import { IsInt, Min } from "class-validator";
import { Type } from "class-transformer";

export class CreateRoundDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  schemeId!: number;
}
