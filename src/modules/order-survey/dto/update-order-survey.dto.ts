import { PartialType } from '@nestjs/mapped-types';
import { CreateOrderSurveyDto } from './create-order-survey.dto';

export class UpdateOrderSurveyDto extends PartialType(CreateOrderSurveyDto) {}
