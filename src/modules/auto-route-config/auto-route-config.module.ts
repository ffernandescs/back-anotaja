import { Module } from '@nestjs/common';
import { AutoRouteConfigService } from './auto-route-config.service';
import { AutoRouteConfigController } from './auto-route-config.controller';

@Module({
  controllers: [AutoRouteConfigController],
  providers: [AutoRouteConfigService],
})
export class AutoRouteConfigModule {}
