// ✅ SEED REORGANIZADO — PADRÃO ESCALÁVEL SaaS PDV + DELIVERY

import { prisma } from '../lib/prisma';
import { hash } from 'bcryptjs';
import { PlanType, BillingPeriod } from '@prisma/client';

async function seedFeaturesAndPlans() {
  console.log('🚀 Seed estruturado iniciado...');

  // ======================================================
  // 0. USUÁRIO MASTER
  // ======================================================
  const masterUser = await prisma.masterUser.upsert({
    where: { email: 'master@anotaja.com' },
    update: {},
    create: {
      name: 'Master User',
      email: 'master@anotaja.com',
      password: await hash('master123', 10),
      active: true,
    },
  });

  console.log(`✅ Usuário Master criado/atualizado: ${masterUser.email}`);

  // ======================================================
  // 1. MENU GROUPS
  // ======================================================
  const menuGroups = [
    { title: 'Dashboard', displayOrder: 1 },
    { title: 'Vendas', displayOrder: 2 },
    { title: 'Catálogo', displayOrder: 3 },
    { title: 'Operação', displayOrder: 4 },
    { title: 'Financeiro', displayOrder: 5 },
    { title: 'Relatórios', displayOrder: 6 },
    { title: 'Administração', displayOrder: 7 },
  ];

  for (const group of menuGroups) {
    const existingGroup = await prisma.menuGroup.findFirst({
      where: { title: group.title }
    });

    if (existingGroup) {
      await prisma.menuGroup.update({
        where: { id: existingGroup.id },
        data: { ...group, active: true },
      });
    } else {
      await prisma.menuGroup.create({
        data: { ...group, active: true },
      });
    }
  }

  const groups = await prisma.menuGroup.findMany();
  const getGroupId = (title: string) => groups.find(g => g.title === title)?.id;

  // ======================================================
  // 2. FEATURES (DOMÍNIO)
  // ======================================================
  const features = [
    { key: 'dashboard', name: 'Dashboard', group: 'Dashboard' },

    { key: 'sales', name: 'Vendas', group: 'Vendas' },
    { key: 'catalog', name: 'Catálogo', group: 'Catálogo' },
    { key: 'operations', name: 'Operação', group: 'Operação' },
    { key: 'financial', name: 'Financeiro', group: 'Financeiro' },
    { key: 'reports', name: 'Relatórios', group: 'Relatórios' },
    { key: 'admin', name: 'Administração', group: 'Administração' },
  ];

  const featureMap = new Map<string, string>();

  for (const f of features) {
    const feature = await prisma.feature.upsert({
      where: { key: f.key },
      update: {},
      create: {
        key: f.key,
        name: f.name,
        active: true,
      },
    });

    featureMap.set(f.key, feature.id);

    const groupId = getGroupId(f.group);
    if (groupId) {
      await prisma.featureMenuGroup.upsert({
        where: {
          featureId_groupId: {
            featureId: feature.id,
            groupId,
          },
        },
        update: {},
        create: {
          featureId: feature.id,
          groupId,
        },
      });
    }
  }

  // ======================================================
  // 3. SUBFEATURES
  // ======================================================
  const subFeatures = [
    // VENDAS
    ['order', 'Pedidos', 'sales'],
    ['kanban', 'Kanban', 'sales'],
    ['pdv', 'PDV', 'sales'],
    ['customer', 'Clientes', 'sales'],
    ['kds', 'KDS', 'sales'],
    ['commands', 'Comandas', 'sales'],
    ['table', 'Mesas', 'sales'],

    // CATÁLOGO
    ['product', 'Produtos', 'catalog'],
    ['category', 'Categorias', 'catalog'],
    ['complement', 'Complementos', 'catalog'],

    // OPERAÇÃO
    ['stock', 'Estoque', 'operations'],
    ['delivery', 'Entregas', 'operations'],
    ['delivery_person', 'Entregadores', 'operations'],
    ['delivery_area', 'Áreas', 'operations'],
    ['delivery_route', 'Rotas', 'operations'],
    ['coupons', 'Cupons', 'operations'],

    // FINANCEIRO
    ['cash_session', 'Caixa', 'financial'],
    ['cash_history', 'Histórico Caixa', 'financial'],
    ['cash_reports', 'Relatórios Caixa', 'financial'],
    ['cash_dashboard', 'Dashboard Caixa', 'financial'],
    ['cash_shifts', 'Turnos', 'financial'],
    ['payment_method', 'Pagamentos', 'financial'],

    // RELATÓRIOS
    ['reports', 'Relatórios Gerais', 'reports'],

    // ADMIN
    ['user', 'Usuários', 'admin'],
    ['group', 'Grupos', 'admin'],
    ['branch', 'Filiais', 'admin'],
    ['subscription', 'Assinatura', 'admin'],
    ['hours', 'Horários', 'admin'],
    ['announcement', 'Anúncios', 'admin'],
    ['points', 'Pontos', 'admin'],
    ['profile', 'Perfil', 'admin'],
  ];

  const subFeatureMap = new Map<string, string>();

  for (const [key, name, parent] of subFeatures) {
    const parentId = featureMap.get(parent);

    if (!parentId) {
      console.error(`❌ Parent feature não encontrada: ${parent} para ${key}`);
      continue;
    }

    const existing = await prisma.feature.findUnique({ 
      where: { key },
      include: { parent: true }
    });

    let feature;

    if (existing) {
      // 🔥 Evita converter feature principal em subfeature
      if (existing.parentId && existing.parentId !== parentId) {
        console.warn(`⚠️ Subfeature ${key} já existe com parent diferente. Atualizando...`);
      }
      
      // 🔥 GARANTE vínculo com parent (corrige seu problema)
      feature = await prisma.feature.update({
        where: { id: existing.id },
        data: {
          name,
          parentId, // <-- ESSENCIAL
          active: true,
        },
      });
    } else {
      feature = await prisma.feature.create({
        data: {
          key,
          name,
          parentId,
          active: true,
        },
      });
    }

    subFeatureMap.set(key, feature.id);
  }

  // ======================================================
  // 4. PLANOS
  // ======================================================
  const plans = [
    {
      name: 'TRIAL',
      type: PlanType.TRIAL,
      price: 0,
      isTrial: true,
      trialDays: 7,
      limits: {
        branches: 1,
        users: 2,
        products: 20,
        ordersPerMonth: 100,
      },
      features: [
        'dashboard',
        'sales', 'order', 'pdv', 'customer',
        'catalog', 'product'
      ],
    },
    {
      name: 'BASIC',
      type: PlanType.BASIC,
      price: 99.9,
      limits: {
        branches: 1,
        users: 5,
        products: 300,
        ordersPerMonth: 1000,
      },
      features: [
        'dashboard',

        'sales', 'order', 'kanban', 'pdv', 'customer',

        'catalog', 'product', 'category',

        'operations', 'stock',

        'financial', 'cash_session',

        'reports'
      ],
    },
    {
      name: 'PREMIUM',
      type: PlanType.PREMIUM,
      price: 299.9,
      limits: {
        branches: 3,
        users: 15,
        products: 2000,
        ordersPerMonth: 5000,
      },
      features: [
        'dashboard',

        'sales', 'order', 'kanban', 'pdv', 'customer', 'kds', 'commands', 'table',

        'catalog', 'product', 'category', 'complement',

        'operations', 'stock', 'delivery', 'delivery_person', 'delivery_area', 'delivery_route', 'coupons',

        'financial', 'cash_session', 'cash_history', 'cash_reports', 'cash_dashboard', 'cash_shifts', 'payment_method',

        'reports',

        'admin', 'user', 'group', 'branch'
      ],
    },
    {
      name: 'ENTERPRISE',
      type: PlanType.ENTERPRISE,
      price: 599.9,
      limits: {
        branches: -1,
        users: -1,
        products: -1,
        ordersPerMonth: -1,
      },
      features: ['*'],
    },
  ];

  for (const p of plans) {
    let plan = await prisma.plan.findFirst({
      where: { type: p.type }
    });

    if (plan) {
      plan = await prisma.plan.update({
        where: { id: plan.id },
        data: {
          name: p.name,
          type: p.type,
          price: p.price,
          billingPeriod: BillingPeriod.MONTHLY,
          isTrial: p.isTrial || false,
          trialDays: p.trialDays || 0,
          limits: JSON.stringify(p.limits),
          active: true,
        },
      });
    } else {
      plan = await prisma.plan.create({
        data: {
          name: p.name,
          type: p.type,
          price: p.price,
          billingPeriod: BillingPeriod.MONTHLY,
          isTrial: p.isTrial || false,
          trialDays: p.trialDays || 0,
          limits: JSON.stringify(p.limits),
          active: true,
        },
      });
    }

    let featuresToLink: any[] = [];

    if (p.features.includes('*')) {
      featuresToLink = await prisma.feature.findMany();
    } else {
      featuresToLink = await prisma.feature.findMany({
        where: { key: { in: p.features } },
      });
    }

    for (const f of featuresToLink) {
      await prisma.planFeature.upsert({
        where: {
          planId_featureId: {
            planId: plan.id,
            featureId: f.id,
          },
        },
        update: {},
        create: {
          planId: plan.id,
          featureId: f.id,
        },
      });
    }

    console.log(`✅ Plano ${p.name} configurado`);
  }

  console.log('🎉 Seed finalizado com sucesso');
}

seedFeaturesAndPlans()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
