import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class GenerateDescriptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;
}
