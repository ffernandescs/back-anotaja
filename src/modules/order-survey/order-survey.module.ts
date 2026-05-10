import { Module } from '@nestjs/common';
import { OrderSurveyService } from './order-survey.service';
import {
  OrderSurveyController,
  OrderSurveyPublicController,
} from './order-survey.controller';

@Module({
  controllers: [OrderSurveyController, OrderSurveyPublicController],
  providers: [OrderSurveyService],
  exports: [OrderSurveyService], // exporta para usar em OrdersService
})
export class OrderSurveyModule {}