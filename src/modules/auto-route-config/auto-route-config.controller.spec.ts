import { Test, TestingModule } from '@nestjs/testing';
import { AutoRouteConfigController } from './auto-route-config.controller';
import { AutoRouteConfigService } from './auto-route-config.service';

describe('AutoRouteConfigController', () => {
  let controller: AutoRouteConfigController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AutoRouteConfigController],
      providers: [AutoRouteConfigService],
    }).compile();

    controller = module.get<AutoRouteConfigController>(AutoRouteConfigController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
