import { Test, TestingModule } from '@nestjs/testing';
import { OrderSurveyController } from './order-survey.controller';
import { OrderSurveyService } from './order-survey.service';

describe('OrderSurveyController', () => {
  let controller: OrderSurveyController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderSurveyController],
      providers: [OrderSurveyService],
    }).compile();

    controller = module.get<OrderSurveyController>(OrderSurveyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
