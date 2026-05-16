import { IsString, MinLength } from 'class-validator';

export class ChangeCustomerPasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(6, { message: 'Nova senha deve ter no mínimo 6 caracteres' })
  newPassword!: string;

  @IsString()
  @MinLength(6, { message: 'Confirmação deve ter no mínimo 6 caracteres' })
  confirmPassword!: string;
}
