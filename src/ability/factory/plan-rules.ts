// ─────────────────────────────────────────────────────────────
// ability/factory/plan-rules.ts
//
// Define o TETO de features por plano.
// Nenhum grupo ou usuário pode ter mais do que o plano permite.
// ─────────────────────────────────────────────────────────────

import { Action, AddonType, DefinePermission, PlanLimits, PlanType, Subject } from '../types/ability.types';

// ─────────────────────────────────────────────────────────────
// Features base por plano (com herança)
// ─────────────────────────────────────────────────────────────

// BASIC: Base para todos os planos
const BASIC_FEATURES: Array<[Action, Subject]> = [
  [Action.READ,   Subject.DASHBOARD],       // Dashboard sempre visível
  [Action.MANAGE, Subject.ORDER],           // Gestão de pedidos
  [Action.MANAGE, Subject.PRODUCT],         // Gestão de produtos
  [Action.MANAGE, Subject.CATEGORY],        // Gestão de categorias
  [Action.READ,   Subject.CUSTOMER],        // Visualizar clientes
  [Action.READ,   Subject.REPORT],          // Relatórios básicos
  [Action.MANAGE, Subject.GROUP],           // Gestão de grupos
  [Action.MANAGE, Subject.USER],            // Gestão de usuários
  [Action.READ,   Subject.SUBSCRIPTION],    // Visualizar assinatura
  [Action.READ,   Subject.BRANCH],          // Visualizar filiais
  [Action.MANAGE, Subject.PAYMENT_METHOD],  // Gestão de métodos de pagamento
  [Action.MANAGE, Subject.DELIVERY_AREA],   // Gestão de áreas de entrega
  [Action.READ,   Subject.PROFILE],         // Configurações de perfil
  [Action.READ,   Subject.HOURS],           // Configurações de horário
  [Action.READ,   Subject.PAYMENT],         // Configurações de pagamento
];

// PREMIUM: BASIC + Features avançadas
const PREMIUM_FEATURES: Array<[Action, Subject]> = [
  ...BASIC_FEATURES,
  // Upgrades do BASIC para PREMIUM
  [Action.MANAGE, Subject.CUSTOMER],        // Gestão completa de clientes (upgrade de READ)
  [Action.MANAGE, Subject.REPORT],          // Relatórios completos + exportação (upgrade de READ)
  [Action.MANAGE, Subject.SUBSCRIPTION],    // Gestão de assinatura (upgrade de READ)
  [Action.MANAGE, Subject.BRANCH],          // Gestão de filiais (upgrade de READ)
  // Novas features exclusivas do PREMIUM
  [Action.MANAGE, Subject.CASH_REGISTER],   // Fluxo de caixa
  [Action.MANAGE, Subject.COUPON],          // Cupons de desconto
  [Action.MANAGE, Subject.STOCK],           // Controle de estoque
  [Action.MANAGE, Subject.DELIVERY_PERSON], // Gestão de entregadores
];

// ENTERPRISE: BASIC + PREMIUM + Features exclusivas
const ENTERPRISE_FEATURES: Array<[Action, Subject]> = [
  [Action.MANAGE, Subject.ALL],             // Acesso total a tudo
];

// ─────────────────────────────────────────────────────────────
// Exportação final com lógica de ambiente
// ─────────────────────────────────────────────────────────────

export const PLAN_FEATURES: Record<PlanType, Array<[Action, Subject | Subject[]]>> = {
  // TRIAL: Em DEV = ALL, em PROD = ENTERPRISE (para testes completos)
  [PlanType.TRIAL]: 
    process.env.NODE_ENV === 'development'
      ? ENTERPRISE_FEATURES
      : ENTERPRISE_FEATURES,

  // BASIC: Plano base
  [PlanType.BASIC]: BASIC_FEATURES,

  // PREMIUM: BASIC + features avançadas
  [PlanType.PREMIUM]: PREMIUM_FEATURES,

  // ENTERPRISE: Acesso total
  [PlanType.ENTERPRISE]: ENTERPRISE_FEATURES,
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
export const ADDON_FEATURES: Record<AddonType, Array<[Action, Subject]>> = {
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