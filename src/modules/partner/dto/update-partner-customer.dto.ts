import { PartialType } from '@nestjs/mapped-types';
import { CreatePartnerCustomerDto } from './create-partner-customer.dto';

export class UpdatePartnerCustomerDto extends PartialType(CreatePartnerCustomerDto) {}
