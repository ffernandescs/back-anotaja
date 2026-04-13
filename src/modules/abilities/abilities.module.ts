// abilities.module.ts

import { Module } from '@nestjs/common';
import { AbilitiesService } from './abilities.service';
import { AbilitiesGuard } from './abilities.guard';
import { AbilitiesResolver } from './abilities.resolver';

@Module({
  providers: [AbilitiesService, AbilitiesGuard, AbilitiesResolver],
  exports: [AbilitiesService, AbilitiesGuard, AbilitiesResolver],
})
export class AbilitiesModule {}

