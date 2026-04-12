import { Type } from 'class-transformer';
import { IsArray, IsInt, IsString, Min, ValidateNested } from 'class-validator';

export class RelatedProductItemDto {
  @IsString()
  relatedProductId!: string;

  @IsInt()
  @Min(0)
  priority!: number;
}

export class UpsertRelatedProductsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RelatedProductItemDto)
  relatedProducts!: RelatedProductItemDto[];
}
