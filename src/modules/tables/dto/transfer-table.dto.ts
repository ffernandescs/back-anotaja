import { IsString, IsNotEmpty } from 'class-validator';

export class TransferTableDto {
  @IsString()
  @IsNotEmpty()
  fromTableId!: string;

  @IsString()
  @IsNotEmpty()
  toTableId!: string;
}
