import {
  IsInt,
  IsBoolean,
  IsOptional,
  IsString,
  Min,
  Max,
} from 'class-validator';

export class CreateOrderSurveyDto {
  @IsInt()
  @Min(1)
  @Max(5)
  productQuality!: number;

  @IsInt()
  @Min(1)
  @Max(5)
  deliveryTime!: number;

  @IsInt()
  @Min(1)
  @Max(5)
  attendantRating!: number;

  @IsInt()
  @Min(1)
  @Max(5)
  packagingRating!: number;

  @IsBoolean()
  wouldRecommend!: boolean;

  @IsOptional()
  @IsString()
  comment?: string;
}