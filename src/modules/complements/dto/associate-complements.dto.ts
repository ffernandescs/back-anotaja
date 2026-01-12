import { IsArray, IsString, IsNotEmpty, ArrayMinSize } from 'class-validator';

export class AssociateComplementsDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Pelo menos um complemento deve ser fornecido' })
  @IsString({ each: true, message: 'Cada ID deve ser uma string' })
  @IsNotEmpty({ each: true, message: 'Os IDs não podem estar vazios' })
  complementIds!: string[];
}
