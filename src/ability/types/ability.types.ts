// ─────────────────────────────────────────────────────────────
// ability/types/ability.types.ts
//
// Espelha os enums do Prisma para uso no CASL.
// Importe SEMPRE daqui — nunca do @prisma/client diretamente
// nos arquivos de ability, para manter o domínio desacoplado.
// ─────────────────────────────────────────────────────────────

import {
  AbilityBuilder,
  AbilityClass,
  ExtractSubjectType,
  InferSubjects,
  MongoAbility,
  createMongoAbility,
} from '@casl/ability';
import { RawRuleOf } from '@casl/ability';

// ── Actions ──────────────────────────────────────────────────
export enum Action {
  CREATE  = 'create',
  READ    = 'read',
  UPDATE  = 'update',
  DELETE  = 'delete',
  MANAGE  = 'manage', // wildcard: equivale a todos os actions
}

// ── Subjects ─────────────────────────────────────────────────
// Cada subject mapeia uma feature/recurso do sistema.
// 'all' é reservado do CASL (usado no Trial).
export enum Subject {
  ALL             = 'all',
  ORDER           = 'order',
  KANBAN          = 'kanban',
  PDV             = 'pdv',
  PRODUCT         = 'product',
  CATEGORY        = 'category',
  COMPLEMENT      = 'complement',
  CUSTOMER        = 'customer',
  DASHBOARD       = 'dashboard',
  PROFILE         = 'profile',
  HOURS           = 'hours',
  PAYMENT         = 'payment',
  REPORT          = 'report',
  COUPON          = 'coupon',
  STOCK           = 'stock',
  KDS             = 'kds',
  DELIVERY_AREA   = 'delivery_area',
  DELIVERY_ROUTE  = 'delivery_route',
  DELIVERY_PERSON = 'delivery_person',
  CASH_REGISTER   = 'cash_register',
  TABLE           = 'table',
  COMMANDS        = 'commands',
  PAYMENT_METHOD  = 'payment_method',
  POINTS          = 'points',
  ANNOUNCEMENT    = 'announcement',
  GROUP           = 'group',
  USER            = 'user',
  SUBSCRIPTION    = 'subscription',
  BRANCH          = 'branch',
}

// ── Add-ons ───────────────────────────────────────────────────
export enum AddonType {
  FISCAL_NOTE      = 'FISCAL_NOTE',
  ADVANCED_REPORTS = 'ADVANCED_REPORTS',
  MULTI_BRANCH     = 'MULTI_BRANCH',
  LOYALTY_POINTS   = 'LOYALTY_POINTS',
  WHATSAPP_NOTIFY  = 'WHATSAPP_NOTIFY',
  ROUTE_OPTIMIZER  = 'ROUTE_OPTIMIZER',
}

// ── Planos ────────────────────────────────────────────────────
export enum PlanType {
  TRIAL      = 'TRIAL',
  BASIC      = 'BASIC',
  PREMIUM    = 'PREMIUM',
  ENTERPRISE = 'ENTERPRISE',
}

// Limites por feature (estrutura genérica e personalizável)
export interface FeatureLimit {
  featureKey: string;      // "product", "user", "order"
  name: string;            // "Produtos", "Usuários", "Pedidos"
  description?: string;    // "Limite de produtos cadastrados"
  maxValue: number;         // -1 = ilimitado
  unit?: string;          // "itens", "usuários", "pedidos/mês"
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Limites quantitativos por plano (agora genérico e dinâmico)
export interface PlanLimits {
  [featureKey: string]: FeatureLimit;
}

export const createAppAbility = (
  rules: RawRuleOf<AppAbility>[] = []
) => createMongoAbility<AppAbility>(rules);

// ── Tipo da Ability montada pelo CASL ────────────────────────
export type AppAbility = MongoAbility<[Action, Subject | any]>;

// ── Tipos auxiliares para o builder ──────────────────────────
export type DefinePermission = (
  action: Action | Action[],
  subject: Subject | Subject[],
  conditions?: any,
) => void;

// ── Estrutura recebida do Prisma para montar a ability ────────
export interface AbilityContext {
  user: {
    id: string;
    groupId: string | null;
    permissions: PermissionRule[];   // overrides do usuário
    group: {
      permissions: PermissionRule[]; // permissões base do grupo
    } | null;
  };
  tenant: {
    plan: PlanType;
    createdAt: Date;
    addons: AddonType[];             // add-ons ativos
    subscriptionStart: Date | null;
    subscriptionEnd: Date | null;
    subscriptionStatus: string;
  };
}

export interface PermissionRule {
  action: Action;
  subject: Subject;
  inverted: boolean;
}

// ── Formato serializado para o frontend ──────────────────────
export interface SerializedPermission {
  action: Action;
  subject: Subject;
  inverted: boolean;
  conditions?: any;
}