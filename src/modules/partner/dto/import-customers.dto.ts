import { IsString } from 'class-validator';

export class ImportCustomersDto {
  @IsString()
  csvContent!: string;
}
