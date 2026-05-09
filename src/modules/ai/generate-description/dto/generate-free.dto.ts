// dto/generate-free.dto.ts
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class GenerateFreeDto {
  @IsString()
  @IsNotEmpty({ message: 'O prompt não pode ser vazio' })
  @MaxLength(2000, { message: 'O prompt não pode ter mais de 2000 caracteres' })
  prompt!: string;
}