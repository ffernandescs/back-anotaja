import { Injectable } from '@nestjs/common';
import { AbilitiesService } from './abilities.service';
import { User } from '@prisma/client';

type Permission = {
  subject: string;
  action: string;
  inverted?: boolean;
};

@Injectable()
export class AbilitiesResolver {
  constructor(private abilitiesService: AbilitiesService) {}

async resolveUserAbility(user: any) {
  if (!user?.companyId) return null;

  let ability;

  try {
    ability = await this.abilitiesService.buildAbility(user.companyId);
  } catch (error) {
    console.warn('⚠️ Ability fallback:', error);

    // 👇 fallback seguro
    return {
      features: [],
      actions: {},
      limits: {},
    };
  }

  const groupPermissions = user.group?.permissions || [];
  const userOverrides = user.permissions || [];

  const finalActions: Record<string, string[]> = {};

  for (const feature of ability.features) {
    const defaultActions = ability.actions[feature] || [];

    const groupPerms = groupPermissions.filter(
      (p) => p.subject === feature,
    );

    const overridePerms = userOverrides.filter(
      (p) => p.subject === feature,
    );

    let allowed = new Set<string>();

    // BASE
    if (groupPerms.length === 0) {
      defaultActions.forEach((a) => allowed.add(a));
    } else {
      groupPerms.forEach((p) => {
        if (!p.inverted) allowed.add(p.action);
      });
    }

    // OVERRIDES
    overridePerms.forEach((p) => {
      if (p.inverted) {
        allowed.delete(p.action);
      } else {
        allowed.add(p.action);
      }
    });

    // INTERSEÇÃO COM PLANO
    finalActions[feature] = Array.from(allowed).filter((action) =>
      defaultActions.includes(action),
    );
  }

  return {
    features: ability.features,
    actions: finalActions,
    limits: ability.limits,
  };
}
}