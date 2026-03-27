// ─────────────────────────────────────────────────────────────
// ability/ability.module.ts
// ─────────────────────────────────────────────────────────────

import { Global, Module } from '@nestjs/common';
import { AbilityFactory } from './factory/ability.factory';
import { AbilityLoaderService } from './factory/ability-loader.service';
import { FeaturePermissionsService } from './factory/feature-permissions.service';
import { AbilitiesGuard } from './guards/abilities.guard';
import { AbilitySerializer } from './serializer/ability.serializer';

/**
 * @Global() permite injetar AbilitiesGuard e AbilitySerializer
 * em qualquer módulo sem reimportar AbilityModule.
 */
@Global()
@Module({
  providers: [
    AbilityFactory,
    AbilityLoaderService,
    FeaturePermissionsService,
    AbilitiesGuard,
    AbilitySerializer,
  ],
  exports: [
    AbilityFactory,
    AbilityLoaderService,
    FeaturePermissionsService,
    AbilitiesGuard,
    AbilitySerializer,
  ],
})
export class AbilityModule {}