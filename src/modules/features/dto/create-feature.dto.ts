import { IsString, IsOptional, IsBoolean, IsArray } from 'class-validator';

export class CreateFeatureDto {
  @IsString() key!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true })
  defaultActions?: string[]; // Array de strings para permissões
  @IsOptional() @IsString() href?: string; // Rota da feature
  @IsOptional() @IsString() menuGroupId?: string; // ✅ ID do grupo para associação (string, não UUID)
}
