import { PartialType } from '@nestjs/mapped-types';
import { CreateGeocodingDto } from './create-geocoding.dto';

export class UpdateGeocodingDto extends PartialType(CreateGeocodingDto) {}
