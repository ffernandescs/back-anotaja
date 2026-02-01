import { IsString, IsOptional, IsArray, IsNumber, IsNotEmpty } from 'class-validator';

export class CreateDeliveryAssignmentDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  deliveryPersonId?: string;

  @IsArray()
  @IsNotEmpty()
  @IsString({ each: true })
  orderIds!: string[];

  @IsOptional()
  route?: any;

  @IsOptional()
  @IsNumber()
  estimatedDistance?: number;

  @IsOptional()
  @IsNumber()
  estimatedTime?: number;

  @IsString()
  @IsOptional()
  status?: string;
}
