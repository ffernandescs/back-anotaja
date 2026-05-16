import { IsOptional, IsString } from 'class-validator';

export class CreateOrderOriginDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  code?: string;
}

export class UpdateOrderOriginDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  code?: string;
}

export class SuggestOrderOriginCodeDto {
  @IsString()
  name!: string;
}
