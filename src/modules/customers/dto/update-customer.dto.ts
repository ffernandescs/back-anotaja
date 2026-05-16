import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateCustomerDto } from './create-customer.dto';

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {
  @IsOptional()
  @IsBoolean()
  /** true desliga todas as automações do bot CRM só neste cliente (sem alterar outros cadastros). */
  crmBootBotDisabled?: boolean;
}
