import { IsString } from 'class-validator';

export class DeliveryHeartbeatDto {
  @IsString()
  deliveryPersonId!: string;
}
