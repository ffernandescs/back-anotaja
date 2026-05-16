import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class OrderChannelCampaignRecipientDto {
  @IsString()
  customerId!: string;

  @IsString()
  name!: string;

  @IsString()
  phone!: string;
}

export class CreateOrderChannelCampaignDto {
  @IsString()
  title!: string;

  @IsString()
  phoneNumber!: string;

  @IsString()
  orderOriginId!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderChannelCampaignRecipientDto)
  recipients?: OrderChannelCampaignRecipientDto[];
}

export class UpdateOrderChannelCampaignDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  orderOriginId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderChannelCampaignRecipientDto)
  recipients?: OrderChannelCampaignRecipientDto[];
}

export class QueryOrderChannelCampaignMessagesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;
}

export class BulkCreateOrderChannelCampaignsDto {
  @IsString()
  title!: string;

  @IsString()
  phoneNumber!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderChannelCampaignRecipientDto)
  recipients?: OrderChannelCampaignRecipientDto[];
}
