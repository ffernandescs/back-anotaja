// ─────────────────────────────────────────────────────────────
// ability/factory/plan-rules.ts
//
// Define o TETO de features por plano.
// Nenhum grupo ou usuário pode ter mais do que o plano permite.
// ─────────────────────────────────────────────────────────────

import { Action, AddonType, DefinePermission, PlanLimits, PlanType, Subject } from '../types/ability.types';
import { FeaturePermissionsService } from './feature-permissions.service';
import { prisma } from '../../../lib/prisma';

// ─────────────────────────────────────────────────────────────
// Features base por plano (AGORA DINÂMICO - busca do banco)
// ─────────────────────────────────────────────────────────────

/**
 * Busca features do plano diretamente do banco
 */
export async function getPlanFeatures(planType: PlanType): Promise<string[]> {
  const plan = await prisma.plan.findFirst({
    where: { type: planType, active: true },
    include: {
      planFeatures: {
        include: {
          feature: true
        }
      }
    }
  });

  if (!plan) {
    console.warn(`⚠️ Plano ${planType} não encontrado no banco`);
    return [];
  }

  return plan.planFeatures
    .filter(pf => pf.feature.active) // ✅ Filtrar features ativas
    .map(pf => pf.feature.key)
    .filter((key): key is string => key !== undefined);
}

/**
 * Busca features de addons diretamente do banco
 */
export async function getAddonFeatures(addons: AddonType[]): Promise<string[]> {
  if (addons.length === 0) return [];

  // Futuramente: implementar sistema de addons no banco
  // Por enquanto, retorna array vazio
  return [];
}

/**
 * Busca limites do plano diretamente do banco
 */
async function getPlanLimits(planType: PlanType): Promise<PlanLimits> {
  const plan = await prisma.plan.findFirst({
    where: { type: planType, active: true }
  });

  if (!plan || !plan.limits) {
    // Fallback para limites padrão
    return getDefaultLimits(planType);
  }

  try {
    return JSON.parse(plan.limits);
  } catch (error) {
    console.warn(`⚠️ Erro ao parsear limites do plano ${planType}:`, error);
    return getDefaultLimits(planType);
  }
}

/**
 * Limites padrão como fallback
 */
function getDefaultLimits(planType: PlanType): PlanLimits {
  const defaultLimits: Record<PlanType, PlanLimits> = {
    [PlanType.TRIAL]: {
      maxUsers: 2,
      maxProducts: 1,
      maxOrdersPerMonth: 1000,
      maxBranches: 5,
      maxDeliveryPeople: 10,
    },
    [PlanType.BASIC]: {
      maxUsers: 2,
      maxProducts: 200,
      maxOrdersPerMonth: 200,
      maxBranches: 1,
      maxDeliveryPeople: 0,
    },
    [PlanType.PREMIUM]: {
      maxUsers: 5,
      maxProducts: 1000,
      maxOrdersPerMonth: 1000,
      maxBranches: 2,
      maxDeliveryPeople: 2,
    },
    [PlanType.ENTERPRISE]: {
      maxUsers: 999,
      maxProducts: 9999,
      maxOrdersPerMonth: 9999,
      maxBranches: 999,
      maxDeliveryPeople: 999,
    },
  };

  return defaultLimits[planType];
}

export async function applyPlanRules(
  can: DefinePermission,
  plan: PlanType,
  addons: AddonType[],
): Promise<void> {
  const featurePermissions = new FeaturePermissionsService();
  
  // ✅ Obter features do plano diretamente do banco
  const planFeatures = await getPlanFeatures(plan);
  const limits = await getPlanLimits(plan);
  const addonFeatures = await getAddonFeatures(addons);

  // Criar mapa de limites para o serviço de permissões
  const limitsMap = new Map<string, number>([
    ['users', limits.maxUsers],
    ['products', limits.maxProducts],
    ['branches', limits.maxBranches],
    ['deliveryPersons', limits.maxDeliveryPeople],
    ['ordersPerMonth', limits.maxOrdersPerMonth],
  ]);

  // Combinar features do plano + addons
  const allFeatures = [...planFeatures, ...addonFeatures];

  // Aplicar permissões das features
  await featurePermissions.generatePermissionsFromFeatures(can, allFeatures, limitsMap);
}