// src/modules/store/dto/create-survey-response.dto.ts
import { IsInt, IsBoolean, IsOptional, IsString, Min, Max, IsNotEmpty } from 'class-validator';

export class CreateSurveyResponseDto {
  @IsInt()
  @Min(1)
  @Max(5)
  overallRating!: number;

  @IsInt()
  @Min(1)
  @Max(5)
  menuNavigation!: number;

  @IsInt()
  @Min(1)
  @Max(5)
  productPhotos!: number;

  @IsInt()
  @Min(1)
  @Max(5)
  mobileExperience!: number;

  @IsInt()
  @Min(1)
  @Max(5)
  checkoutEase!: number;

  @IsBoolean()
  wouldRecommend!: boolean;

  @IsOptional()
  @IsString()
  comment?: string;
}