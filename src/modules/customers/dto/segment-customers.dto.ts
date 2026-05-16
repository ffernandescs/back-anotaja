import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export const SEGMENT_FILTER_FIELDS = [
  'total_orders',
  'average_ticket',
  'created_at',
  'last_order_at',
  'order_on_date',
] as const;

export const SEGMENT_FILTER_OPERATORS = ['eq', 'neq', 'lt', 'gt'] as const;

export type SegmentFilterField = (typeof SEGMENT_FILTER_FIELDS)[number];
export type SegmentFilterOperator = (typeof SEGMENT_FILTER_OPERATORS)[number];

export class CampaignRecipientFilterRuleDto {
  @IsEnum(SEGMENT_FILTER_FIELDS)
  field!: SegmentFilterField;

  @IsEnum(SEGMENT_FILTER_OPERATORS)
  operator!: SegmentFilterOperator;

  @IsString()
  value!: string;
}

export class SegmentCustomersDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CampaignRecipientFilterRuleDto)
  rules?: CampaignRecipientFilterRuleDto[];

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  limit?: number = 500;
}
