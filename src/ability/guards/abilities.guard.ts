// ─────────────────────────────────────────────────────────────
// ability/guards/abilities.guard.ts
//
// Guard principal de permissões.
// Fluxo por request:
//   1. Lê as regras exigidas pelo decorator @CheckAbilities
//   2. Extrai userId e companyId do JWT (via request.user)
//   3. Carrega/cacheia a ability do usuário
//   4. Verifica se TODAS as regras são satisfeitas
// ─────────────────────────────────────────────────────────────

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AbilityLoaderService } from '../factory/ability-loader.service';
import {
  CHECK_ABILITY,
  RequiredRule,
} from '../decorators/check-abilities.decorator';
import { Action, AppAbility, Subject } from '../types/ability.types';

// Interface do payload JWT — ajuste conforme seu AuthService
interface JwtPayload {
  sub: string;       // userId
  companyId: string;
  branchId?: string;
}

@Injectable()
export class AbilitiesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly abilityLoader: AbilityLoaderService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Lê as regras do decorator (pode ser undefined se não aplicado)
    const rules = this.reflector.getAllAndOverride<RequiredRule[]>(
      CHECK_ABILITY,
      [context.getHandler(), context.getClass()],
    );

    // Sem decorator = rota pública para permissões (auth ainda valida o JWT)
    if (!rules || rules.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload;

    if (!user?.sub || !user?.companyId) {
      throw new UnauthorizedException('Token inválido ou ausente');
    }

    // Cacheia a ability no request para evitar múltiplas queries
    // se múltiplos guards rodarem no mesmo request
    if (!request._ability) {
      request._ability = await this.abilityLoader.loadAbility(
        user.sub,
        user.companyId,
      );
    }

    const ability: AppAbility = request._ability;

    // Valida TODAS as regras — AND lógico entre múltiplas permissões
    const allowed = rules.every(({ action, subject }) =>
      ability.can(action, subject),
    );

    if (!allowed) {
      throw new ForbiddenException(
        'Você não tem permissão para realizar esta ação',
      );
    }

    return true;
  }
}