import { Module } from '@nestjs/common';
import { BranchesService } from './branches.service';
import { BranchesController } from './branches.controller';
import { BranchOnboardingService } from './branch-onboarding.service';
import { BranchOnboardingController } from './branch-onboarding.controller';
import { GeocodingModule } from '../geocoding/geocoding.module';

@Module({
  imports: [GeocodingModule],
  controllers: [BranchesController, BranchOnboardingController],
  providers: [BranchesService, BranchOnboardingService],
})
export class BranchesModule {}
