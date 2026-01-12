import { PartialType } from '@nestjs/mapped-types';
import { CreateComplementDto } from './create-complement.dto';

export class UpdateComplementDto extends PartialType(CreateComplementDto) {}
