import { Test, TestingModule } from '@nestjs/testing';
import { BillsplitsService } from './billsplits.service';

describe('BillsplitsService', () => {
  let service: BillsplitsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BillsplitsService],
    }).compile();

    service = module.get<BillsplitsService>(BillsplitsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
