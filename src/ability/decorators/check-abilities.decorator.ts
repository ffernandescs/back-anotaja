// ─────────────────────────────────────────────────────────────
// ability/decorators/check-abilities.decorator.ts
// ─────────────────────────────────────────────────────────────

import { SetMetadata } from '@nestjs/common';
import { Action, Subject } from '../types/ability.types';

export interface RequiredRule {
  action: Action;
  subject: Subject;
}

export const CHECK_ABILITY = 'check_ability';

/**
 * Decorator que define as permissões necessárias para acessar uma rota.
 *
 * @example
 * // Exige que o usuário possa ler relatórios
 * @CheckAbilities({ action: Action.READ, subject: Subject.REPORT })
 *
 * @example
 * // Múltiplas permissões (todas devem ser satisfeitas)
 * @CheckAbilities(
 *   { action: Action.READ,   subject: Subject.ORDER },
 *   { action: Action.CREATE, subject: Subject.ORDER },
 * )
 */
export const CheckAbilities = (...rules: RequiredRule[]) =>
  SetMetadata(CHECK_ABILITY, rules);