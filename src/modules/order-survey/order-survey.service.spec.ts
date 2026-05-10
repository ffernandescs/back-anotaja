import { Test, TestingModule } from '@nestjs/testing';
import { OrderSurveyService } from './order-survey.service';

describe('OrderSurveyService', () => {
  let service: OrderSurveyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OrderSurveyService],
    }).compile();

    service = module.get<OrderSurveyService>(OrderSurveyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
