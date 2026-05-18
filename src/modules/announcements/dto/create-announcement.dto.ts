import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export enum AnnouncementType {
  INFO = 'INFO',
  WARNING = 'WARNING',
  SUCCESS = 'SUCCESS',
  PROMOTION = 'PROMOTION',
}

export class CreateAnnouncementDto {
  @IsString()
  @MinLength(3)
  title!: string;

  @IsString()
  @MinLength(10)
  message!: string;

  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @IsEnum(AnnouncementType)
  type!: AnnouncementType;

  @IsBoolean()
  active!: boolean;

  @IsOptional()
  @IsString()
  displayPeriod?: string | null;

  @IsOptional()
  @IsString()
  displayDays?: string | null;

  @IsInt()
  @Min(0)
  displayOrder!: number;

  @IsString()
  branchId!: string;
}
