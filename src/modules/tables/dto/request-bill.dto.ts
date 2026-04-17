import { IsString, IsOptional } from 'class-validator';

export class RequestBillDto {
  @IsString()
  @IsOptional()
  notes?: string;
}
