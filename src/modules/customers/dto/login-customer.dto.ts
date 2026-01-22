import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// customer/dto/login-customer.dto.ts
export class LoginCustomerDto {
  @IsNotEmpty()
  @IsString()
  phone!: string;
}
