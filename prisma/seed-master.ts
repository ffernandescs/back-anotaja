// ✅ SEED FINAL — ESCALONAMENTO POR PÚBLICO-ALVO
// TRIAL (7d) → BASIC (R$49) → GROWTH (R$119) → BUSINESS (R$219)
// + ADD-ONS para features complexas

import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';
import { BillingPeriod, PaymentMethodType, PlanType } from '@prisma/client';




export const paymentMethods = [
  {
    id: PaymentMethodType.CASH,
    name: 'Dinheiro',
    isActive: true,
    type: PaymentMethodType.CASH,
    icon: 'cash',
  },

  {
    id: PaymentMethodType.CREDIT,
    name: 'Cartão de Crédito',
    isActive: true,
    type: PaymentMethodType.CREDIT,
    icon: 'visa',
  },

  {
    id: PaymentMethodType.DEBIT,
    name: 'Cartão de Débito',
    isActive: true,
    type: PaymentMethodType.DEBIT,
    icon: 'mastercard',
  },

  {
    id: PaymentMethodType.PIX,
    name: 'PIX',
    isActive: true,
    type: PaymentMethodType.PIX,
    icon: 'pix',
  },

  {
    id: PaymentMethodType.ONLINE,
    name: 'Pagamento Online',
    isActive: true,
    type: PaymentMethodType.ONLINE,
    icon: 'paypal',
  },

  {
    id: PaymentMethodType.FOOD_VOUCHER,
    name: 'Vale Alimentação',
    isActive: true,
    type: PaymentMethodType.FOOD_VOUCHER,
    icon: 'visa',
  },

  {
    id: PaymentMethodType.MEAL_VOUCHER,
    name: 'Vale Refeição',
    isActive: true,
    type: PaymentMethodType.MEAL_VOUCHER,
    icon: 'visa',
  },

  {
    id: PaymentMethodType.BOLETO,
    name: 'Boleto Bancário',
    isActive: true,
    type: PaymentMethodType.BOLETO,
    icon: 'pagseguro',
  },

  {
    id: PaymentMethodType.PICPAY,
    name: 'PicPay',
    isActive: true,
    type: PaymentMethodType.PICPAY,
    icon: 'picpay',
  },

  {
    id: PaymentMethodType.CREDIT_NOTE,
    name: 'Nota de Crédito',
    isActive: true,
    type: PaymentMethodType.CREDIT_NOTE,
    icon: 'nubank',
  },

  // {
  //   id: PaymentMethodType.BANK_TRANSFER,
  //   name: 'Transferência Bancária',
  //   isActive: true,
  //   type: PaymentMethodType.BANK_TRANSFER,
  //   icon: 'bank-transfer',
  // },

  // {
  //   id: PaymentMethodType.CHECK,
  //   name: 'Cheque',
  //   isActive: true,
  //   type: PaymentMethodType.CHECK,
  //   icon: 'boost',
  // },

  // {
  //   id: PaymentMethodType.CRYPTO,
  //   name: 'Criptomoeda',
  //   isActive: true,
  //   type: PaymentMethodType.CRYPTO,
  //   icon: 'bitcoin',
  // },

  // {
  //   id: PaymentMethodType.APPLE_PAY,
  //   name: 'Apple Pay',
  //   isActive: true,
  //   type: PaymentMethodType.APPLE_PAY,
  //   icon: 'apple-pay',
  // },

  // {
  //   id: PaymentMethodType.GOOGLE_PAY,
  //   name: 'Google Pay',
  //   isActive: true,
  //   type: PaymentMethodType.GOOGLE_PAY,
  //   icon: 'google-pay',
  // },

  // {
  //   id: PaymentMethodType.SAMSUNG_PAY,
  //   name: 'Samsung Pay',
  //   isActive: true,
  //   type: PaymentMethodType.SAMSUNG_PAY,
  //   icon: 'samsung-pay',
  // },

  // {
  //   id: PaymentMethodType.PAYPAL,
  //   name: 'PayPal',
  //   isActive: true,
  //   type: PaymentMethodType.PAYPAL,
  //   icon: 'paypal',
  // },

  {
    id: PaymentMethodType.MERCADO_PAGO,
    name: 'Mercado Pago',
    isActive: true,
    type: PaymentMethodType.MERCADO_PAGO,
    icon: 'mercadopago',
  },

  {
    id: PaymentMethodType.PAGSEGURO,
    name: 'PagSeguro',
    isActive: true,
    type: PaymentMethodType.PAGSEGURO,
    icon: 'pagseguro',
  },

  // {
  //   id: PaymentMethodType.ELO,
  //   name: 'Cartão Elo',
  //   isActive: true,
  //   type: PaymentMethodType.ELO,
  //   icon: 'elo',
  // },

  // {
  //   id: PaymentMethodType.HIPERCARD,
  //   name: 'Hipercard',
  //   isActive: true,
  //   type: PaymentMethodType.HIPERCARD,
  //   icon: 'hipercard',
  // },

  // {
  //   id: PaymentMethodType.AMEX,
  //   name: 'American Express',
  //   isActive: true,
  //   type: PaymentMethodType.AMEX,
  //   icon: 'americanexpress',
  // },

  // {
  //   id: PaymentMethodType.DINERS,
  //   name: 'Diners Club',
  //   isActive: true,
  //   type: PaymentMethodType.DINERS,
  //   icon: 'dinersclub',
  // },

  // {
  //   id: PaymentMethodType.DISCOVER,
  //   name: 'Master',
  //   isActive: true,
  //   type: PaymentMethodType.DISCOVER,
  //   icon: 'discover',
  // },

  // {
  //   id: PaymentMethodType.JCB,
  //   name: 'JCB',
  //   isActive: true,
  //   type: PaymentMethodType.JCB,
  //   icon: 'jcb',
  // },

  // {
  //   id: PaymentMethodType.AURA,
  //   name: 'Aura',
  //   isActive: true,
  //   type: PaymentMethodType.AURA,
  //   icon: 'aura',
  // },

  {
    id: PaymentMethodType.OTHER,
    name: 'Outro',
    isActive: true,
    type: PaymentMethodType.OTHER,
    icon: 'default',
  },
];

async function seed() {
  console.log('🚀 Seed iniciado... Estratégia: Escalonamento por público-alvo');

  // ======================================================
  // MASTER USER
  // ======================================================
  await prisma.masterUser.upsert({
    where: { email: 'master@anotaja.com' },
    update: {},
    create: {
      email: 'master@anotaja.com',
      name: 'Master User',
      password: await bcrypt.hash('master123', 10),
    },
  });
  console.log('✅ Usuário Master criado/atualizado');

  // ======================================================
  // PAYMENT METHODS
  // ======================================================
for (const method of paymentMethods) {
  await prisma.paymentMethod.upsert({
    where: {
      type: method.type, // 👈 isso precisa ser @unique no schema
    },
    update: {
      name: method.name,
      isActive: method.isActive,
      icon: method.icon,
    },
    create: {
      type: method.type,
      name: method.name,
      isActive: method.isActive,
      icon: method.icon,
    },
  });
}
  // ======================================================
  // MENU GROUPS
  // ======================================================
  const groupsData = [
    'Dashboard',
    'Operação', // PDV, Salão, Cozinha, Delivery
    'Cardápio',
    'Financeiro',
    'Clientes',
    'Desempenho',
    'Administração',
  ];

  for (let i = 0; i < groupsData.length; i++) {
    const title = groupsData[i];

    const existingGroup = await prisma.menuGroup.findFirst({
      where: { title },
    });

    if (existingGroup) {
      await prisma.menuGroup.update({
        where: { id: existingGroup.id },
        data: {
          displayOrder: i + 1,
          active: true,
          title, // garante sync caso mude no seed
        },
      });
    } else {
      await prisma.menuGroup.create({
        data: {
          title,
          displayOrder: i + 1,
          active: true,
        },
      });
    }
  }
  console.log('✅ Menu Groups criados');

  const groups = await prisma.menuGroup.findMany();
  const getGroupId = (title: string) =>
    groups.find((g) => g.title === title)?.id;

  // ======================================================
  // MAIN FEATURES (com icons)
  // Formato: [key, name, group, href, icon]
  // Organizado para sistema de delivery PDV multitenant
  // ======================================================
  const mainFeatures: Array<[string, string, string, string | null, string]> = [
    // DASHBOARD
    ['dashboard', 'Dashboard', 'Dashboard', '/admin/dashboard', 'LayoutGrid'],

    // OPERAÇÃO (core do sistema - PDV, Salão, Cozinha, Delivery)
    ['pdv', 'PDV', 'Operação', '/admin/pdv', 'ShoppingCart'],
    ['salon', 'Salão', 'Operação', '/admin/salon', 'Wine'],
    ['kitchen', 'Cozinha', 'Operação', '/admin/kitchen', 'ChefHat'],
    ['delivery_orders', 'Delivery', 'Operação', '/admin/delivery/orders', 'Truck'],

    // CARDÁPIO (gerenciamento de produtos)
    ['menu', 'Cardápio', 'Cardápio', '/admin/menu', 'BookOpen'],

    // FINANCEIRO (gestão financeira)
    ['financial', 'Financeiro', 'Financeiro', '/admin/financial', 'DollarSign'],
    ['cash', 'Caixa', 'Financeiro', '/admin/financial/cash', 'Wallet'],

    // CLIENTES (CRM)
    ['customers', 'Clientes', 'Clientes', '/admin/customers', 'Users'],

    // DESEMPENHO (relatórios)
    ['performance', 'Desempenho', 'Desempenho', '/admin/performance', 'TrendingUp'],

    // ADMINISTRAÇÃO (configurações da empresa)
    ['administration', 'Administração', 'Administração', '/admin/administration', 'Settings'],
    ['my_company', 'Minha Empresa', 'Administração', '/admin/administration/my-company', 'Building2'],
  ];

  const featureMap = new Map<string, string>();

  for (const featureData of mainFeatures) {
    const [featureKey, featureName, group, href, icon] = featureData;
    if (!featureKey) continue;

    const feature = await prisma.feature.upsert({
      where: { key: featureKey },
      update: {
        name: featureName,
        icon: icon ?? undefined,
        href,
        active: true,
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
      },
      create: {
        key: featureKey,
        name: featureName,
        icon: icon ?? undefined,
        href,
        active: true,
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
      },
    });

    featureMap.set(featureKey, feature.id);

    const groupId = getGroupId(group);
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

  console.log('✅ Features principais criadas (com icons)');

  // ======================================================
  // SUBFEATURES (sem icons)
  // Formato: [key, name, parentKey, href, displayOrder]
  // Organizado para sistema de delivery PDV multitenant
  // ======================================================
  const subFeatures: Array<[string, string, string | null, string | null, number]> = [
    // OPERAÇÃO - PDV
    ['orders', 'Pedidos', 'pdv', '/admin/sales/orders', 1],
    ['kanban', 'Kanban', 'pdv', '/admin/sales/kanban', 2],

    // OPERAÇÃO - SALÃO
    ['salon_floor', 'Mesas e Comandas', 'salon', '/admin/sales/tables', 1],

    // OPERAÇÃO - COZINHA
    ['kds', 'KDS', 'kitchen', '/admin/sales/kds', 1],

    // OPERAÇÃO - DELIVERY
    ['delivery_areas', 'Áreas de Entrega', 'delivery_orders', '/admin/delivery/areas', 1],
    ['delivery_persons', 'Entregadores', 'delivery_orders', '/admin/delivery/persons', 2],
    ['delivery_routes', 'Rotas de Entrega', 'delivery_orders', '/admin/delivery/routes', 3],
    ['delivery_assignments', 'Atribuições', 'delivery_orders', '/admin/delivery/assignments', 4],

    // CARDÁPIO
    ['categories', 'Categorias', 'menu', '/admin/menu/categories', 1],
    ['products', 'Produtos', 'menu', '/admin/menu/products', 2],
    ['complements', 'Complementos', 'menu', '/admin/menu/complements', 3],
    ['complement_options', 'Opções de Complemento', 'menu', '/admin/menu/complement-options', 4],
    ['stock', 'Estoque', 'menu', '/admin/menu/stock', 5],

    // FINANCEIRO
    ['financial_reports', 'Relatórios Financeiros', 'financial', '/admin/financial/reports', 1],
    ['coupons', 'Cupons', 'financial', '/admin/financial/coupons', 2],
    ['cash_flow', 'Fluxo de Caixa', 'cash', '/admin/financial/cash', 1],

    // CLIENTES
    ['customer_list', 'Lista de Clientes', 'customers', '/admin/customers', 1],
    ['customer_loyalty', 'Fidelização', 'customers', '/admin/customers/loyalty', 2],

    // DESEMPENHO
    ['sales_analysis', 'Vendas', 'performance', '/admin/performance/vendas', 1],
    ['performance_customers', 'Clientes', 'performance', '/admin/performance/clientes', 2],
    ['performance_products', 'Produtos', 'performance', '/admin/performance/produtos', 3],

    // ADMINISTRAÇÃO
    ['users', 'Usuários', 'administration', '/admin/users', 1],
    ['branches', 'Filiais', 'administration', '/admin/administration/branches', 2],
    ['groups', 'Grupos', 'administration', '/admin/administration/groups', 3],
    ['roles', 'Permissões', 'administration', '/admin/administration/roles', 4],

    // MINHA EMPRESA
    ['settings_profile', 'Perfil da Empresa', 'my_company', '/admin/administration/settings/profile', 1],
    ['settings_hours', 'Horários', 'my_company', '/admin/administration/settings/hours', 2],
    ['settings_service_fee', 'Taxa de Serviço', 'my_company', '/admin/administration/settings/service-fee', 3],
    ['settings_announcements', 'Avisos', 'my_company', '/admin/administration/settings/announcements', 4],
    ['settings_subscription', 'Assinatura', 'my_company', '/admin/administration/settings/payments', 5],
    ['settings_plans', 'Planos', 'my_company', '/admin/administration/settings/subscription', 6],
    ['settings_tables', 'Mesas e Comandas', 'my_company', '/admin/administration/settings/tables', 7],
    ['settings_integrations', 'Integrações', 'my_company', '/admin/administration/settings/integrations', 8],
  ];

  for (const [subKey, featureName, parentKey, href, displayOrder] of subFeatures) {
    if (!subKey || !featureName) {
      console.error(`❌ Key ou name inválidos: ${subKey}, ${featureName}`);
      continue;
    }

    if (!parentKey) {
      const feature = await prisma.feature.upsert({
        where: { key: subKey },
        update: {
          name: featureName,
          href: href ?? undefined,
          displayOrder: displayOrder || 0,
          active: true,
          defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
        },
        create: {
          key: subKey,
          name: featureName,
          href: href ?? undefined,
          displayOrder: displayOrder || 0,
          active: true,
          defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
        },
      });

      featureMap.set(subKey, feature.id);
      continue;
    }

    const parentId = featureMap.get(parentKey);

    if (!parentId) {
      console.error(`❌ Parent feature não encontrada: ${parentKey} para ${subKey}`);
      continue;
    }

    const feature = await prisma.feature.upsert({
      where: { key: subKey },
      update: {
        name: featureName,
        href: href ?? undefined,
        parentId,
        displayOrder: displayOrder || 0,
        active: true,
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
      },
      create: {
        key: subKey,
        name: featureName,
        href: href ?? undefined,
        parentId,
        displayOrder: displayOrder || 0,
        active: true,
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
      },
    });

    if (parentId) {
      const parentFeature = await prisma.feature.findUnique({
        where: { id: parentId },
        include: {
          featureMenuGroups: {
            include: { group: true }
          }
        }
      });

      if (parentFeature?.featureMenuGroups?.[0]) {
        const groupId = parentFeature.featureMenuGroups[0].groupId;

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

    featureMap.set(subKey as string, feature.id);
  }

  console.log('✅ Subfeatures criadas (sem icons)');

  // ======================================================
  // FEATURES PARA LIMITES (uso interno, não aparecem no menu)
  // ======================================================
  const limitFeatures = ['products', 'users', 'branches', 'monthly_orders'];
  for (const limitKey of limitFeatures) {
    const existing = await prisma.feature.findUnique({
      where: { key: limitKey },
    });
    if (!existing) {
      await prisma.feature.create({
        data: {
          key: limitKey,
          name: `Limite: ${limitKey}`,
          active: false, // Não exibe no menu
          defaultActions: JSON.stringify([]),
        },
      });
    }
  }
  console.log('✅ Features de limite criadas (internas)');

  // ======================================================
  // PLANOS ESCALONADOS
  // ======================================================
  const plans = [
    {
      name: 'TRIAL',
      type: PlanType.TRIAL,
      price: 0,
      isTrial: true,
      trialDays: 7,
      description: '7 dias grátis - Teste tudo sem limites',
      features: ['*'], // TODAS as features
    },
    {
      name: 'BÁSICO',
      type: PlanType.BASIC,
      price: 4990, // R$ 49.90
      isTrial: false,
      description: 'Para lanchonetes e botecos - O essencial para vender',
      features: [
        'dashboard',
        'pdv', 'orders', 'kanban',
        'menu', 'categories', 'products', 'complements', 'complement_options',
        'cash',
        'customers',
        'configuracoes', 'settings_profile',
      ],
    },
    {
      name: 'GROWTH',
      type: PlanType.PREMIUM,
      price: 11990, // R$ 119.90
      isTrial: false,
      description: 'Para pizzarias e restaurantes pequenos - Gerencie operação',
      features: [
        ...['dashboard', 'pdv', 'orders', 'kanban', 'salon', 'salon_floor', 'kitchen', 'kds'],
        ...['menu', 'categories', 'products', 'complements', 'complement_options', 'stock'],
        ...['delivery_orders', 'delivery_areas', 'delivery_persons'],
        ...['cash', 'financial', 'payment_methods', 'coupons'],
        ...['customers', 'performance', 'sales_analysis', 'performance_customers'],
        ...['administration', 'users', 'my_company', 'settings_profile', 'settings_hours', 'settings_service_fee', 'settings_tables'],
      ],
    },
    {
      name: 'BUSINESS',
      type: PlanType.ENTERPRISE,
      price: 21990, // R$ 219.90
      isTrial: false,
      description: 'Para distribuidoras e redes - Escale seu negócio',
      features: ['*'], // TODAS as features
    },
  ];

  for (const p of plans) {
    const existingPlan = await prisma.plan.findFirst({
      where: { type: p.type }
    });

    let plan: Awaited<ReturnType<typeof prisma.plan.create>>;
    if (existingPlan) {
      plan = await prisma.plan.update({
        where: { id: existingPlan.id },
        data: {
          name: p.name,
          type: p.type,
          price: p.price,
          description: p.description,
          billingPeriod: BillingPeriod.MONTHLY,
          isTrial: p.isTrial || false,
          trialDays: p.trialDays || 0,
          active: true,
        },
      });
    } else {
      plan = await prisma.plan.create({
        data: {
          name: p.name,
          type: p.type,
          price: p.price,
          description: p.description,
          billingPeriod: BillingPeriod.MONTHLY,
          isTrial: p.isTrial || false,
          trialDays: p.trialDays || 0,
          active: true,
        },
      });
    }

    const features =
      p.features.includes('*')
        ? await prisma.feature.findMany()
        : await prisma.feature.findMany({
            where: { key: { in: p.features } },
          });

    for (const f of features) {
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

    // ========== CONFIGURAR LIMITES POR PLANO ==========
    const planLimits = {
      [PlanType.TRIAL]: [
        { featureKey: 'products', name: 'Produtos', maxValue: -1, unit: 'itens' },
        { featureKey: 'users', name: 'Usuários simultâneos', maxValue: -1, unit: 'pessoas' },
        { featureKey: 'branches', name: 'Filiais', maxValue: -1, unit: 'filiais' },
        { featureKey: 'monthly_orders', name: 'Pedidos/mês', maxValue: -1, unit: 'pedidos' },
      ],
      [PlanType.BASIC]: [
        { featureKey: 'products', name: 'Produtos no cardápio', maxValue: 50, unit: 'itens' },
        { featureKey: 'users', name: 'Usuários simultâneos', maxValue: 2, unit: 'pessoas' },
        { featureKey: 'branches', name: 'Filiais', maxValue: 1, unit: 'filial' },
        { featureKey: 'monthly_orders', name: 'Pedidos/mês', maxValue: -1, unit: 'pedidos' },
      ],
      [PlanType.PREMIUM]: [
        { featureKey: 'products', name: 'Produtos no cardápio', maxValue: 300, unit: 'itens' },
        { featureKey: 'users', name: 'Usuários simultâneos', maxValue: 5, unit: 'pessoas' },
        { featureKey: 'branches', name: 'Filiais', maxValue: 1, unit: 'filial' },
        { featureKey: 'monthly_orders', name: 'Pedidos/mês', maxValue: -1, unit: 'pedidos' },
      ],
      [PlanType.ENTERPRISE]: [
        { featureKey: 'products', name: 'Produtos no cardápio', maxValue: -1, unit: 'itens' },
        { featureKey: 'users', name: 'Usuários simultâneos', maxValue: 15, unit: 'pessoas' },
        { featureKey: 'branches', name: 'Filiais', maxValue: -1, unit: 'filiais' },
        { featureKey: 'monthly_orders', name: 'Pedidos/mês', maxValue: -1, unit: 'pedidos' },
      ],
    };

    const limits = planLimits[p.type];
    if (limits) {
      for (const limit of limits) {
        await prisma.featureLimit.upsert({
          where: {
            featureKey_planId: {
              featureKey: limit.featureKey,
              planId: plan.id,
            },
          },
          update: {
            name: limit.name,
            maxValue: limit.maxValue,
            unit: limit.unit,
          },
          create: {
            featureKey: limit.featureKey,
            planId: plan.id,
            name: limit.name,
            maxValue: limit.maxValue,
            unit: limit.unit,
            isActive: true,
          },
        });
      }
    }
  }

  console.log('✅ Planos criados com limites');

  // ======================================================
  // ADD-ONS ESTRATÉGICOS (monetização de features complexas)
  // ======================================================
  const addons = [
    {
      key: 'integration_platforms',
      name: 'Integração com Plataformas',
      description: 'Conecte com iFood, Uber Eats e outras plataformas de delivery',
      price: 3900, // R$ 39/mês
      features: ['integration_platforms'],
    },
    {
      key: 'delivery_advanced',
      name: 'Delivery Avançado',
      description: 'Rotas otimizadas, geolocalização, despachante automático',
      price: 4900, // R$ 49/mês
      features: ['delivery_routes', 'delivery_assignments'],
    },
    {
      key: 'additional_branch',
      name: 'Filial Adicional',
      description: 'Adicione uma filial extra ao seu plano',
      price: 2900, // R$ 29/mês
      features: ['branches'],
    },
    {
      key: 'analytics_enterprise',
      name: 'Analytics Enterprise',
      description: 'Relatórios avançados, BI, exportação de dados',
      price: 4900, // R$ 49/mês
      features: ['performance', 'sales_analysis'],
    },
    {
      key: 'priority_support',
      name: 'Suporte Prioritário',
      description: 'Chat prioritário, suporte via WhatsApp',
      price: 2900, // R$ 29/mês
      features: [],
    },
  ];

  for (const addon of addons) {
    const existingAddon = await prisma.addon.findFirst({
      where: { key: addon.key }
    });

    let addonRecord: Awaited<ReturnType<typeof prisma.addon.create>>;
    if (existingAddon) {
      addonRecord = await prisma.addon.update({
        where: { id: existingAddon.id },
        data: {
          name: addon.name,
          description: addon.description,
          price: addon.price,
          active: true,
        },
      });
    } else {
      addonRecord = await prisma.addon.create({
        data: {
          key: addon.key,
          name: addon.name,
          description: addon.description,
          price: addon.price,
          active: true,
        },
      });
    }

    // Associar features ao addon
    for (const featureKey of addon.features) {
      const feature = await prisma.feature.findUnique({
        where: { key: featureKey },
      });

      if (feature) {
        await prisma.addonFeature.upsert({
          where: {
            addonId_featureId: {
              addonId: addonRecord.id,
              featureId: feature.id,
            },
          },
          update: {},
          create: {
            addonId: addonRecord.id,
            featureId: feature.id,
          },
        });
      }
    }
  }

  console.log('✅ Add-ons estratégicos criados');

  // ======================================================
  // RESUMO FINAL
  // ======================================================
  console.log('\n📊 RESUMO DO SEED:\n');
  console.log('🎯 PLANOS:');
  console.log('  • TRIAL (7 dias) — Teste ilimitado');
  console.log('  • BÁSICO (R$ 49/mês) — Lanchonete/Boteco');
  console.log('  • GROWTH (R$ 119/mês) — Pizzaria/Restaurante');
  console.log('  • BUSINESS (R$ 219/mês) — Distribuidora/Rede');
  console.log('\n🔌 ADD-ONS:');
  console.log('  • Integração com plataformas (R$ 39/mês)');
  console.log('  • Delivery avançado (R$ 49/mês)');
  console.log('  • Filial adicional (R$ 29/mês)');
  console.log('  • Analytics Enterprise (R$ 49/mês)');
  console.log('  • Suporte prioritário (R$ 29/mês)');
  console.log('\n✅ Seed finalizado com sucesso!\n');

}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
