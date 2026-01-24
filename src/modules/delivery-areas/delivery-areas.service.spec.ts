import { Test, TestingModule } from '@nestjs/testing';
import { DeliveryAreasService } from './delivery-areas.service';

describe('DeliveryAreasService', () => {
  let service: DeliveryAreasService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DeliveryAreasService],
    }).compile();

    service = module.get<DeliveryAreasService>(DeliveryAreasService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
