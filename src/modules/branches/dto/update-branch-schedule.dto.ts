// dto/update-branch-schedule.dto.ts
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsDateString,
} from 'class-validator';

export class UpdateBranchScheduleDto {
  @IsString()
  @IsNotEmpty()
  day!: string; // 'monday', 'tuesday', etc.

  @IsString()
  @IsNotEmpty()
  open!: string; // '08:00'

  @IsString()
  @IsNotEmpty()
  close!: string; // '18:00'

  @IsOptional()
  @IsBoolean()
  closed?: boolean;

  @IsOptional()
  @IsDateString()
  date?: Date;
}
