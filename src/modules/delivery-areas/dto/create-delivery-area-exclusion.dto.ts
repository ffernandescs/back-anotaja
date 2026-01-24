
// dto/create-delivery-area-exclusion.dto.ts
import { IsString, IsNumber, IsBoolean, IsEnum, ValidateIf } from 'class-validator';

export class CreateDeliveryAreaExclusionDto {
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

  @IsBoolean()
  active!: boolean;
}
