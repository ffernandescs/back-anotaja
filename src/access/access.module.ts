import { Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { FeatureGuard } from './guards/feature.guard';
import { LimitGuard } from './guards/limit.guard';
import { PermGuard } from './guards/perm.guard';
import { AbilityModule } from '../ability/ability.module';

@Module({
  imports: [AbilityModule],
  providers: [AccessService, FeatureGuard, LimitGuard, PermGuard],
  exports: [AccessService, FeatureGuard, LimitGuard, PermGuard],
})
export class AccessModule {}
