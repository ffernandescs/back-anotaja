import { Module } from '@nestjs/common';
import { FeaturesService } from './features.service';
import { FeaturesController } from './features.controller';
import { CreateFeaturesService } from './create-features.service';

@Module({
  controllers: [FeaturesController],
  providers: [FeaturesService, CreateFeaturesService],
  exports: [FeaturesService],
})
export class FeaturesModule {}
