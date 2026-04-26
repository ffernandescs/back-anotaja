import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateWhatsAppConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyNewOrder?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOrderStatus?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyDelivery?: boolean;

  @IsOptional()
  @IsString()
  notifyNumber?: string;

  @IsOptional()
  @IsBoolean()
  orderConfirmationEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  orderReadyEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  deliveryStartEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  deliveryCancelEnabled?: boolean;

  // Message templates
  @IsOptional()
  @IsString()
  templateConfirmation?: string;

  @IsOptional()
  @IsString()
  templateReady?: string;

  @IsOptional()
  @IsString()
  templateOutForDelivery?: string;

  @IsOptional()
  @IsString()
  templateDelivered?: string;

  @IsOptional()
  @IsString()
  templateCancelled?: string;
}

export class SendTestMessageDto {
  @IsString()
  phone!: string;

  @IsOptional()
  @IsString()
  message?: string;
}

// ─── CRM DTOs ────────────────────────────────────────────────────

export class FetchMessagesDto {
  @IsString()
  jid!: string;

  @IsOptional()
  @IsInt()
  count?: number;
}

export class SendCrmMessageDto {
  @IsString()
  jid!: string;

  @IsString()
  text!: string;
}
