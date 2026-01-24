// dto/create-delivery-area.dto.ts
import { IsString, IsNumber, IsOptional, IsBoolean, IsEnum, ValidateIf } from 'class-validator';

export class CreateDeliveryAreaDto {
  @IsString()
  name!: string;

  @IsEnum(['CIRCLE', 'POLYGON'])
  type!: 'CIRCLE' | 'POLYGON';

  // Campos obrigatórios apenas para CIRCLE
  @ValidateIf(o => o.type === 'CIRCLE')
  @IsNumber()
  centerLat?: number;

  @ValidateIf(o => o.type === 'CIRCLE')
  @IsNumber()
  centerLng?: number;

  @ValidateIf(o => o.type === 'CIRCLE')
  @IsNumber()
  radius?: number;

  // Campo obrigatório apenas para POLYGON
  @ValidateIf(o => o.type === 'POLYGON')
  @IsString()
  polygon?: string;

  @IsNumber()
  deliveryFee!: number;

  @IsOptional()
  @IsNumber()
  minOrderValue?: number;

  @IsOptional()
  @IsNumber()
  estimatedTime?: number;


  @IsBoolean()
  active!: boolean;
}
