// ─────────────────────────────────────────────────────────────
// ability/factory/plan-rules.ts
//
// Define o TETO de features por plano.
// Nenhum grupo ou usuário pode ter mais do que o plano permite.
// ─────────────────────────────────────────────────────────────

import { Action, AddonType, DefinePermission, PlanLimits, PlanType, Subject } from '../types/ability.types';
import { FeaturePermissionsService } from './feature-permissions.service';

// ─────────────────────────────────────────────────────────────
// Features base por plano (agora dinâmico)
// ─────────────────────────────────────────────────────────────

// BASIC: Features básicas
const BASIC_FEATURES: string[] = [
  'dashboard',       // Dashboard sempre visível
  'orders',          // Gestão de pedidos
  'products',        // Gestão de produtos
  'categories',      // Gestão de categorias
  'customers',       // Clientes
  'reports',         // Relatórios básicos
  'groups',          // Gestão de grupos
  'users',           // Gestão de usuários
  'subscription',    // Visualizar assinatura
  'branches',        // Visualizar filiais
  'payment_methods', // Métodos de pagamento
  'delivery_areas',  // Áreas de entrega
  'profile',         // Configurações de perfil
  'hours',           // Configurações de horário
  'payment',         // Configurações de pagamento
];

// PREMIUM: BASIC + Features avançadas
const PREMIUM_FEATURES: string[] = [
  ...BASIC_FEATURES,
  'cash_register',   // Fluxo de caixa
  'coupons',         // Cupons de desconto
  'stock',           // Controle de estoque
  'delivery_persons', // Gestão de entregadores
  'tables',          // Mesas
  'pdv',             // Ponto de venda
  'kds',             // Kitchen Display
  'commands',        // Comandas
  'kanban',          // Kanban
];

// ENTERPRISE: Todas as features
const ENTERPRISE_FEATURES: string[] = [
  ...PREMIUM_FEATURES,
  'delivery_routes', // Rotas de entrega
  'points',          // Programa de pontos
  'announcements',   // Avisos
];

// ─────────────────────────────────────────────────────────────
// Exportação final com lógica de ambiente
// ─────────────────────────────────────────────────────────────

export const PLAN_FEATURES: Record<PlanType, string[]> = {
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

// Add-ons desbloqueiam features específicas independente do plano
export const ADDON_FEATURES: Record<AddonType, string[]> = {
  [AddonType.FISCAL_NOTE]: ['orders'],   // já incluso, mas addon habilita emissão NF
  [AddonType.ADVANCED_REPORTS]: ['reports'],
  [AddonType.MULTI_BRANCH]: ['branches'],
  [AddonType.LOYALTY_POINTS]: ['points'],
  [AddonType.WHATSAPP_NOTIFY]: ['customers'],
  [AddonType.ROUTE_OPTIMIZER]: ['delivery_areas'],
};

export function applyPlanRules(
  can: DefinePermission,
  plan: PlanType,
  addons: AddonType[],
): void {
  const featurePermissions = new FeaturePermissionsService();
  
  // Obter features do plano
  const planFeatures = PLAN_FEATURES[plan] ?? [];
  const limits = PLAN_LIMITS[plan];

  // Criar mapa de limites para o serviço de permissões
  const limitsMap = new Map<string, number>([
    ['users', limits.maxUsers],
    ['products', limits.maxProducts],
    ['branches', limits.maxBranches],
    ['deliveryPersons', limits.maxDeliveryPeople],
    ['ordersPerMonth', limits.maxOrdersPerMonth],
  ]);

  // Aplicar permissões das features do plano
  featurePermissions.generatePermissionsFromFeatures(can, planFeatures, limitsMap);

  // Aplicar permissões dos addons
  for (const addon of addons) {
    const addonFeatures = ADDON_FEATURES[addon] ?? [];
    featurePermissions.generatePermissionsFromFeatures(can, addonFeatures);
  }
}