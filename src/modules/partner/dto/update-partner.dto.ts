import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreatePartnerDto } from './create-partner.dto';

export class UpdatePartnerDto extends PartialType(
  OmitType(CreatePartnerDto, ['email', 'password'] as const),
) {}
