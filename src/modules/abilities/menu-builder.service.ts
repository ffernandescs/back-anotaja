import { Injectable } from "@nestjs/common";
import { prisma } from "lib/prisma";

@Injectable()
export class MenuBuilderService {
  constructor() {}

  async build(user: any, abilities: any) {
    const allowedFeatures = new Set(abilities?.features || []);
    const allowedActions = abilities?.actions || {};

    const menuGroups = await prisma.menuGroup.findMany({
      where: { active: true },
      orderBy: { displayOrder: 'asc' },
      include: {
        featureMenuGroups: {
          include: {
            feature: {
              include: {
                children: {
                  where: { active: true },
                  orderBy: { displayOrder: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    const canAccess = (feature: any) => {
      if (!feature?.key) return false;

      if (!allowedFeatures.has(feature.key)) return false;

      const actions = allowedActions[feature.key];
      return actions && actions.length > 0;
    };

    return menuGroups
      .map((group) => {
        const items = group.featureMenuGroups
          .map((fm) => fm.feature)
          .filter((f) => f.parentId === null)
          .map((feature) => {
            const children = (feature.children || []).filter(canAccess);

            // 🔥 submenu
            if (children.length > 0) {
              return {
                id: feature.id,
                label: feature.name,
                icon: feature.icon,
                isPlugin: feature.isPlugin || false,
                children: children.map((c) => ({
                  id: c.id,
                  label: c.name,
                  icon: c.icon,
                  href: c.href,
                  isPlugin: c.isPlugin || false,
                })),
              };
            }

            // 🔥 item simples
            if (!canAccess(feature)) return null;

            return {
              id: feature.id,
              label: feature.name,
              icon: feature.icon,
              href: feature.href,
              isPlugin: feature.isPlugin || false,
            };
          })
          .filter(Boolean);

        if (items.length === 0) return null;

        return {
          title: group.title,
          items,
        };
      })
      .filter(Boolean);
  }
}