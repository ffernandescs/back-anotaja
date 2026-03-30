import { Module } from '@nestjs/common';
import { GeneralConfigController } from './general-config.controller';
import { GeneralConfigService } from './general-config.service';

@Module({
  controllers: [GeneralConfigController],
  providers: [GeneralConfigService],
  exports: [GeneralConfigService],
})
export class GeneralConfigModule {}
