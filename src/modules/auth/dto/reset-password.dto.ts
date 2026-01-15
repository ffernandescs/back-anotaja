import { IsEmail, IsString, Length, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(6, 6, { message: 'OTP deve ter 6 dígitos' })
  otp!: string;

  @MinLength(6)
  newPassword!: string;
}
