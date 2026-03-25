// ─────────────────────────────────────────────────────────────
// ability/serializer/ability.serializer.ts
//
// Converte a ability montada em uma lista de regras serializáveis
// para envio ao frontend via GET /me ou no payload do JWT.
//
// O frontend (Next.js + @casl/react) reconstrói a ability
// localmente com createMongoAbility(permissions) — exatamente
// o mesmo resultado, sem uma query extra.
// ─────────────────────────────────────────────────────────────

import { Injectable } from '@nestjs/common';
import { AppAbility, SerializedPermission } from '../types/ability.types';

@Injectable()
export class AbilitySerializer {
  /**
   * Transforma a AppAbility em um array plano de regras.
   * Formato compatível com createMongoAbility() no frontend.
   */
  serialize(ability: AppAbility): SerializedPermission[] {
    return ability.rules.map((rule) => ({
      action: rule.action as SerializedPermission['action'],
      subject: rule.subject as SerializedPermission['subject'],
      inverted: rule.inverted ?? false,
    }));
  }
}