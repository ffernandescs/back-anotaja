import { IsString } from 'class-validator';

export class AssignDeliveryPersonDto {
  @IsString()
  deliveryPersonId!: string;
}
