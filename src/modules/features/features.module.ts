import { Module } from '@nestjs/common';
import { FeaturesService } from './features.service';
import { FeaturesController } from './features.controller';
import { CreateFeaturesService } from './create-features.service';
import { PlansModule } from '../plans/plans.module';

@Module({
  controllers: [FeaturesController],
  providers: [FeaturesService, CreateFeaturesService],
  imports: [PlansModule],
  exports: [FeaturesService],
})
export class FeaturesModule {}
