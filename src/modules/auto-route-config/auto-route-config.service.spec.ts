import { Test, TestingModule } from '@nestjs/testing';
import { AutoRouteConfigService } from './auto-route-config.service';

describe('AutoRouteConfigService', () => {
  let service: AutoRouteConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AutoRouteConfigService],
    }).compile();

    service = module.get<AutoRouteConfigService>(AutoRouteConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
