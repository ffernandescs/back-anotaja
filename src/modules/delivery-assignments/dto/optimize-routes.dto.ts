import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class OptimizeRoutesDto {
  @IsArray()
  @IsNotEmpty()
  @IsString({ each: true })
  orderIds!: string[];
}
