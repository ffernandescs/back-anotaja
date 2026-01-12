import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';

export enum NotificationEntityType {
  ORDER = 'ORDER',
  SYSTEM = 'SYSTEM',
  ANNOUNCEMENT = 'ANNOUNCEMENT',
}

export class MarkNotificationReadDto {
  @IsEnum(NotificationEntityType)
  @IsNotEmpty()
  entityType!: NotificationEntityType;

  @IsString()
  @IsNotEmpty()
  entityId!: string;

  @IsString()
  @IsOptional()
  metadata?: string;
}
