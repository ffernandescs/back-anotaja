import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateCustomerDto } from './create-customer.dto';

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {
  @IsOptional()
  @IsBoolean()
  /** true = não dispara boot/mensagens automáticas do bot no CRM para este cliente. */
  crmBootBotDisabled?: boolean;
}
