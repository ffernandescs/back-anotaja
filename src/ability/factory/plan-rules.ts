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
 * Busca limites do plano diretamente da tabela FeatureLimit (100% dinâmico e genérico)
 */
export async function getPlanLimits(planType: PlanType): Promise<PlanLimits> {
  // Primeiro buscar o plano para pegar o ID
  const plan = await prisma.plan.findFirst({
    where: { type: planType, active: true }
  });

  if (!plan) {
    console.warn(`⚠️ Plano ${planType} não encontrado no banco`);
    // ✅ Retornar objeto vazio - sem restrições
    return {};
  }

  try {
    // Buscar limites da tabela FeatureLimit
    const featureLimits = await prisma.featureLimit.findMany({
      where: { 
        planId: plan.id,
        isActive: true 
      },
      include: {
        feature: {
          select: { key: true, name: true }
        }
      }
    });

    if (featureLimits.length === 0) {
      console.warn(`⚠️ Plano ${planType} não possui limites configurados na tabela FeatureLimit, sem restrições`);
      // ✅ Retornar objeto vazio - sem restrições
      return {};
    }

    // Montar objeto de limites genérico
    const limits: PlanLimits = {};
    featureLimits.forEach(limit => {
      limits[limit.featureKey] = limit.maxValue; // Apenas o valor numérico
    });

    return limits;
    
  } catch (error) {
    console.warn(`⚠️ Erro ao buscar limites do plano ${planType}:`, error);
    // ✅ Retornar objeto vazio - sem restrições
    return {};
  }
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

  console.log(`🔍 Plan ${plan} features:`, planFeatures);
  console.log(`🔍 Plan ${plan} limits:`, limits);
  console.log(`🔍 Addon features:`, addonFeatures);

  // Criar mapa de limites para o serviço de permissões (dinâmico do banco)
  const limitsMap = new Map<string, number>();
  
  // ✅ Mapear todos os campos do JSON de limites para o mapa
  Object.entries(limits).forEach(([key, value]) => {
    if (typeof value === 'number') {
      limitsMap.set(key, value);
    }
  });
  
  console.log(`🔍 Limits map created:`, Object.fromEntries(limitsMap));

  // Combinar features do plano + addons
  const allFeatures = [...planFeatures, ...addonFeatures];

  // Aplicar permissões das features
  await featurePermissions.generatePermissionsFromFeatures(can, allFeatures, limitsMap);
}
