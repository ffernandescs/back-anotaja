import { Test, TestingModule } from '@nestjs/testing';
import { DeliveryAssignmentsController } from './delivery-assignments.controller';
import { DeliveryAssignmentsService } from './delivery-assignments.service';

describe('DeliveryAssignmentsController', () => {
  let controller: DeliveryAssignmentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeliveryAssignmentsController],
      providers: [DeliveryAssignmentsService],
    }).compile();

    controller = module.get<DeliveryAssignmentsController>(DeliveryAssignmentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
