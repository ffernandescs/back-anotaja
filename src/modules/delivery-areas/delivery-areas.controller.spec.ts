import { Test, TestingModule } from '@nestjs/testing';
import { DeliveryAreasController } from './delivery-areas.controller';
import { DeliveryAreasService } from './delivery-areas.service';

describe('DeliveryAreasController', () => {
  let controller: DeliveryAreasController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeliveryAreasController],
      providers: [DeliveryAreasService],
    }).compile();

    controller = module.get<DeliveryAreasController>(DeliveryAreasController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
