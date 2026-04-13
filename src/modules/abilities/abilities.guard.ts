// abilities.guard.ts

import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AbilitiesService } from './abilities.service';
import { REQUIRE_FEATURE } from './decorators/require-feature.decorator';
import { REQUIRE_ABILITY } from './decorators/require-ability.decorator';

@Injectable()
export class AbilitiesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private abilitiesService: AbilitiesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.get<string>(
      REQUIRE_FEATURE,
      context.getHandler(),
    );

    const abilityMeta = this.reflector.get<{
      feature: string;
      action: string;
    }>(REQUIRE_ABILITY, context.getHandler());

    if (!feature && !abilityMeta) return true;

    const request = context.switchToHttp().getRequest();
    const branchId = request.user?.branchId;

    const ability = await this.abilitiesService.buildAbility(branchId);

    // =========================
    // FEATURE SIMPLES
    // =========================
    if (feature) {
      return this.abilitiesService.hasFeature(ability, feature);
    }

    // =========================
    // FEATURE + ACTION
    // =========================
    if (abilityMeta) {
      return this.abilitiesService.can(
        ability,
        abilityMeta.feature,
        abilityMeta.action,
      );
    }

    return true;
  }
}