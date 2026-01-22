import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { GeocodingService } from './geocoding.service';
import { CreateGeocodingDto } from './dto/create-geocoding.dto';
import { UpdateGeocodingDto } from './dto/update-geocoding.dto';

@Controller('geocoding')
export class GeocodingController {
  constructor(private readonly geocodingService: GeocodingService) {}
}
