import { IsIn, IsString, ValidateIf } from 'class-validator';

export class GenerateDeliveryPasswordDto {
  @ValidateIf((o) => !o.deliveryPersonId)
  @IsString()
  userId?: string;

  @ValidateIf((o) => !o.userId)
  @IsString()
  deliveryPersonId?: string;

  @IsString()
  @IsIn(['password', 'qrcode'])
  type!: 'password' | 'qrcode';
}
