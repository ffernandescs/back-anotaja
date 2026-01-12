import { IsArray, IsString, IsNotEmpty, ArrayMinSize } from 'class-validator';

export class MergeTablesDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(2)
  tableIds!: string[];

  @IsString()
  @IsNotEmpty()
  branchId!: string;

  @IsString()
  @IsNotEmpty()
  targetTableId!: string;

  @IsString()
  @IsNotEmpty()
  customerId?: string;
}
