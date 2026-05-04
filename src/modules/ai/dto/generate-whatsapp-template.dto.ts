import { IsEnum, IsNotEmpty } from 'class-validator';

export class GenerateWhatsAppTemplateDto {
  @IsNotEmpty()
  @IsEnum(['confirmation', 'ready', 'out_for_delivery', 'delivered', 'cancelled'])
  type!: 'confirmation' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled';
}
