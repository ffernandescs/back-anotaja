// ─────────────────────────────────────────────────────────────
// ability/factory/plan-rules.ts
//
// Define o TETO de features por plano.
// Nenhum grupo ou usuário pode ter mais do que o plano permite.
// ─────────────────────────────────────────────────────────────

import { Action, AddonType, DefinePermission, PlanLimits, PlanType, Subject } from '../types/ability.types';

// Features base por plano (sem add-ons)
const PLAN_FEATURES: Record<PlanType, Array<[Action, Subject | Subject[]]>> = {
  // Trial: acesso total (controlado por expiração, não por features)
  [PlanType.TRIAL]: [
    [Action.MANAGE, Subject.ALL],
  ],

  // Basic: operação do dia a dia
  [PlanType.BASIC]: [
    [Action.MANAGE, Subject.ORDER],
    [Action.MANAGE, Subject.PRODUCT],
    [Action.MANAGE, Subject.CATEGORY],
    [Action.READ,   Subject.CUSTOMER],
    [Action.READ,   Subject.REPORT],          // relatórios básicos apenas
    [Action.MANAGE, Subject.GROUP],
    [Action.MANAGE, Subject.USER],
    [Action.READ,   Subject.SUBSCRIPTION],
    [Action.MANAGE, Subject.PAYMENT_METHOD],
    [Action.MANAGE, Subject.DELIVERY_AREA],
  ],

  // Premium: tudo do Basic + features avançadas
  [PlanType.PREMIUM]: [
    [Action.MANAGE, Subject.ORDER],
    [Action.MANAGE, Subject.PRODUCT],
    [Action.MANAGE, Subject.CATEGORY],
    [Action.MANAGE, Subject.CUSTOMER],        // gestão completa de clientes
    [Action.MANAGE, Subject.CASH_REGISTER],
    [Action.MANAGE, Subject.REPORT],          // relatórios completos + exportação
    [Action.MANAGE, Subject.STOCK],
    [Action.MANAGE, Subject.GROUP],
    [Action.MANAGE, Subject.USER],
    [Action.MANAGE, Subject.SUBSCRIPTION],
    [Action.MANAGE, Subject.BRANCH],
    [Action.MANAGE, Subject.PAYMENT_METHOD],
    [Action.MANAGE, Subject.DELIVERY_AREA],
    [Action.MANAGE, Subject.DELIVERY_PERSON],
  ],

  // Enterprise: tudo do Premium (add-ons são controlados separadamente)
  [PlanType.ENTERPRISE]: [
    [Action.MANAGE, Subject.ALL],
  ],
};

// Limites quantitativos por plano
export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  [PlanType.TRIAL]: {
    maxUsers: 10,
    maxProducts: 1000,
    maxOrdersPerMonth: 1000,
    maxBranches: 5,
    maxDeliveryPeople: 10,
  },
  [PlanType.BASIC]: {
    maxUsers: 2,
    maxProducts: 200,
    maxOrdersPerMonth: 200,
    maxBranches: 1,
    maxDeliveryPeople: 0, // Conforme sua atualização anterior, Basic não tem entregadores
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

// Add-ons desbloqueiam subjects específicos independente do plano
const ADDON_FEATURES: Record<AddonType, Array<[Action, Subject]>> = {
  [AddonType.FISCAL_NOTE]:      [[Action.MANAGE, Subject.ORDER]],   // já incluso, mas addon habilita emissão NF
  [AddonType.ADVANCED_REPORTS]: [[Action.MANAGE, Subject.REPORT]],
  [AddonType.MULTI_BRANCH]:     [[Action.MANAGE, Subject.BRANCH]],
  [AddonType.LOYALTY_POINTS]:   [[Action.MANAGE, Subject.POINTS]],
  [AddonType.WHATSAPP_NOTIFY]:  [[Action.MANAGE, Subject.CUSTOMER]],
  [AddonType.ROUTE_OPTIMIZER]:  [[Action.MANAGE, Subject.DELIVERY_AREA]],
};

export function applyPlanRules(
  can: DefinePermission,
  plan: PlanType,
  addons: AddonType[],
): void {
  const features = PLAN_FEATURES[plan] ?? [];
  const limits = PLAN_LIMITS[plan];

  for (const [action, subject] of features) {
    // Injetar condições de limite se existirem para o subject
    let conditions: any = undefined;

    if (action === Action.CREATE || action === Action.MANAGE) {
      if (subject === Subject.USER) conditions = { currentCount: { $lt: limits.maxUsers } };
      if (subject === Subject.PRODUCT) conditions = { currentCount: { $lt: limits.maxProducts } };
      if (subject === Subject.BRANCH) conditions = { currentCount: { $lt: limits.maxBranches } };
      if (subject === Subject.DELIVERY_PERSON) conditions = { currentCount: { $lt: limits.maxDeliveryPeople } };
      if (subject === Subject.ORDER) conditions = { currentCount: { $lt: limits.maxOrdersPerMonth } };
    }

    // Se for MANAGE USER, também permitimos UPDATE/READ/DELETE sem a condição de limite de contagem
    // Isso resolve o problema de não conseguir editar usuários existentes quando o limite é atingido
    if (action === Action.MANAGE && subject === Subject.USER) {
      can(Action.UPDATE, Subject.USER);
      can(Action.DELETE, Subject.USER);
      can(Action.READ, Subject.USER);
      // A condição de limite só deve ser aplicada para CREATE (ou MANAGE se interpretado como criação)
      can(Action.CREATE, Subject.USER, conditions);
    } else {
      can(action, subject as Subject, conditions);
    }
  }

  for (const addon of addons) {
    const addonFeatures = ADDON_FEATURES[addon] ?? [];
    for (const [action, subject] of addonFeatures) {
      can(action, subject);
    }
  }
}