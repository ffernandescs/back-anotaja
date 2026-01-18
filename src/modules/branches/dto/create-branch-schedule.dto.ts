// dto/branch-schedule-item.dto.ts
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsDateString,
} from 'class-validator';

export class BranchScheduleItemDto {
  @IsString()
  @IsNotEmpty()
  day!: string;

  @IsString()
  @IsNotEmpty()
  open!: string;

  @IsString()
  @IsNotEmpty()
  close!: string;

  @IsOptional()
  @IsBoolean()
  closed?: boolean;

  @IsOptional()
  @IsDateString()
  date?: string; // usar string mesmo
}
