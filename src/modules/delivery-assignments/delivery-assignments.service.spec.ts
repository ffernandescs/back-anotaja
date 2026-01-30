import { Test, TestingModule } from '@nestjs/testing';
import { DeliveryAssignmentsService } from './delivery-assignments.service';

describe('DeliveryAssignmentsService', () => {
  let service: DeliveryAssignmentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DeliveryAssignmentsService],
    }).compile();

    service = module.get<DeliveryAssignmentsService>(DeliveryAssignmentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
