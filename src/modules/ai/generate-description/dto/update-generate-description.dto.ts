import { PartialType } from '@nestjs/mapped-types';
import { CreateGenerateDescriptionDto } from './create-generate-description.dto';

export class UpdateGenerateDescriptionDto extends PartialType(CreateGenerateDescriptionDto) {}
