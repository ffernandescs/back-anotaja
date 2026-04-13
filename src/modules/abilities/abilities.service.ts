// abilities.service.ts

import { Injectable } from '@nestjs/common';
import { Ability } from './interfaces/ability.interface';
import { prisma } from 'lib/prisma';

@Injectable()
export class AbilitiesService {
  constructor() {}

  async buildAbility(companyId: string): Promise<Ability> {
    const branch = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        subscription: {
          include: {
            plan: {
              include: {
                planFeatures: {
                  include: { feature: true },
                },
                featureLimits: true,
              },
            },
            addons: {
              include: {
                addon: {
                  include: {
                    features: {
                      include: { feature: true }
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!branch?.subscription) {
      throw new Error('Filial sem assinatura');
    }

    // =========================
    // FEATURES DO PLANO
    // =========================
    const planFeatures =
      branch.subscription.plan.planFeatures.map((pf) => pf.feature);

    // =========================
    // FEATURES DOS ADDONS
    // =========================
    const addonFeatures =
      branch.subscription.addons.flatMap((a) =>
        a.addon.features.map((af) => af.feature),
      );

    const allFeaturesMap = new Map<string, any>();

    [...planFeatures, ...addonFeatures].forEach((f) => {
      allFeaturesMap.set(f.key, f);
    });

    // =========================
    // ACTIONS
    // =========================
    const actions: Record<string, string[]> = {};

    allFeaturesMap.forEach((feature, key) => {
      try {
        actions[key] = JSON.parse(feature.defaultActions || '[]');
      } catch {
        actions[key] = [];
      }
    });

    // =========================
    // LIMITS
    // =========================
    const limits: Record<string, number> = {};

    branch.subscription.plan.featureLimits.forEach((l) => {
      limits[l.featureKey] = l.maxValue;
    });

    return {
      features: Array.from(allFeaturesMap.keys()),
      actions,
      limits,
    };
  }

  // =========================
  // HELPERS
  // =========================

  hasFeature(ability: Ability, feature: string) {
    return ability.features.includes(feature);
  }

  can(ability: Ability, feature: string, action: string) {
    if (!this.hasFeature(ability, feature)) return false;

    const actions = ability.actions[feature] || [];
    return actions.includes(action);
  }

  getLimit(ability: Ability, featureKey: string) {
    return ability.limits[featureKey] ?? -1;
  }
}