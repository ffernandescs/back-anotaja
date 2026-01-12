import { PartialType } from '@nestjs/mapped-types';
import { CreateComplementOptionDto } from './create-complement-option.dto';

export class UpdateComplementOptionDto extends PartialType(CreateComplementOptionDto) {}
