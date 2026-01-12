import { Test, TestingModule } from '@nestjs/testing';
import { CashRegisterController } from './cash-register.controller';
import { CashRegisterService } from './cash-register.service';

describe('CashRegisterController', () => {
  let controller: CashRegisterController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CashRegisterController],
      providers: [CashRegisterService],
    }).compile();

    controller = module.get<CashRegisterController>(CashRegisterController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
