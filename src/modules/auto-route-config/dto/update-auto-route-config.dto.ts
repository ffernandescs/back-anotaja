import { IsBoolean, IsInt, IsEnum, IsOptional, Min } from 'class-validator';

enum DeliveryPersonAvailability {
  DELIVERED = 'DELIVERED',
  COMPLETED = 'COMPLETED',
}

export class UpdateAutoRouteConfigDto {
  @IsOptional()
  @IsBoolean()
  autoDispatch?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxDeliveriesPerTrip?: number;

  @IsOptional()
  @IsInt()
  @Min(100)
  maxDistanceToGroup?: number;

  @IsOptional()
  @IsInt()
  @Min(5)
  maxTimeToGroup?: number;

  @IsOptional()
  @IsEnum(DeliveryPersonAvailability)
  deliveryPersonAvailable?: DeliveryPersonAvailability;
}
