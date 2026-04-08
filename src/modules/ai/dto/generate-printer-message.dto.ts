import { IsEnum, IsNotEmpty } from 'class-validator';

export class GeneratePrinterMessageDto {
  @IsNotEmpty()
  @IsEnum(['delivery', 'table'])
  type!: 'delivery' | 'table';
}
