import { Test, TestingModule } from '@nestjs/testing';
import { BillsplitsController } from './billsplits.controller';
import { BillsplitsService } from './billsplits.service';

describe('BillsplitsController', () => {
  let controller: BillsplitsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BillsplitsController],
      providers: [BillsplitsService],
    }).compile();

    controller = module.get<BillsplitsController>(BillsplitsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
