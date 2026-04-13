import { Injectable } from '@nestjs/common';
import { prisma } from 'lib/prisma';

@Injectable()
export class EntitlementService {
  async resolve(companyId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { companyId },
      include: {
        plan: {
          include: {
            planFeatures: {
              include: { feature: true },
            },
          },
        },
        addons: {
          include: {
            addon: {
              include: {
                features: {
                  include: { feature: true },
                },
              },
            },
          },
        },
      },
    });

    if (!subscription) return [];

    const planFeatures =
      subscription.plan.planFeatures.map((pf) => pf.feature);

    const addonFeatures = subscription.addons.flatMap((a) =>
      a.addon.features.map((f) => f.feature),
    );

    const overrides = await prisma.companyFeatureOverride.findMany({
      where: { companyId },
    });

    let features = [...planFeatures, ...addonFeatures];

    // 🔥 aplicar override
    features = features.filter((f) => {
      const override = overrides.find((o) => o.featureKey === f.key);
      if (!override) return true;
      return override.enabled;
    });

    return features;
  }
}