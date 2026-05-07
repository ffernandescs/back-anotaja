// ✅ SEED FINAL — ESCALONAMENTO POR PÚBLICO-ALVO
// TRIAL (7d) → BASIC (R$49) → GROWTH (R$119) → BUSINESS (R$219)
// + ADD-ONS para features complexas
// + isPro flag nas features exclusivas do plano GROWTH+

import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';
import { BillingPeriod, PaymentMethodType, PlanType } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT METHODS
// ─────────────────────────────────────────────────────────────────────────────
export const paymentMethods = [
  { type: PaymentMethodType.CASH,         name: 'Dinheiro',           isActive: true, icon: 'cash' },
  { type: PaymentMethodType.CREDIT,       name: 'Cartão de Crédito',  isActive: true, icon: 'visa' },
  { type: PaymentMethodType.DEBIT,        name: 'Cartão de Débito',   isActive: true, icon: 'mastercard' },
  { type: PaymentMethodType.PIX,          name: 'PIX',                isActive: true, icon: 'pix' },
  { type: PaymentMethodType.ONLINE,       name: 'Pagamento Online',   isActive: true, icon: 'paypal' },
  { type: PaymentMethodType.FOOD_VOUCHER, name: 'Vale Alimentação',   isActive: true, icon: 'visa' },
  { type: PaymentMethodType.MEAL_VOUCHER, name: 'Vale Refeição',      isActive: true, icon: 'visa' },
  { type: PaymentMethodType.BOLETO,       name: 'Boleto Bancário',    isActive: true, icon: 'pagseguro' },
  { type: PaymentMethodType.PICPAY,       name: 'PicPay',             isActive: true, icon: 'picpay' },
  { type: PaymentMethodType.CREDIT_NOTE,  name: 'Nota de Crédito',    isActive: true, icon: 'nubank' },
  { type: PaymentMethodType.MERCADO_PAGO, name: 'Mercado Pago',       isActive: true, icon: 'mercadopago' },
  { type: PaymentMethodType.PAGSEGURO,    name: 'PagSeguro',          isActive: true, icon: 'pagseguro' },
  { type: PaymentMethodType.OTHER,        name: 'Outro',              isActive: true, icon: 'default' },
];

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE KEYS POR PLANO (fonte da verdade para isPro)
// ─────────────────────────────────────────────────────────────────────────────

/** Features disponíveis no plano BASIC (não são Pro) */
const BASIC_FEATURE_KEYS = new Set([
  'dashboard',
  'pedidos', 'orders', 'kanban',
  'caixa_pdv', 'pdv', 'cash',
  'cardapio', 'categories', 'products', 'complements', 'complement_options',
  'customers',
  'my_restaurant',
  'subscription',
  'help',
  'contact',
]);

/** Features do plano GROWTH (PREMIUM) */
const GROWTH_FEATURE_KEYS = [
  // Já no basic
  'dashboard',
  'pedidos', 'orders', 'kanban',
  'caixa_pdv', 'pdv', 'cash',
  'cardapio', 'categories', 'products', 'complements', 'complement_options',
  'customers',
  'my_restaurant',
  'subscription',
  'help',
  'contact',
  // Exclusivas do Growth+
  'salon', 'salon_tables', 'settings_service_fee', 'settings_tables',
  'kitchen', 'kds',
  'funcionamento_op', 'settings_payment', 'settings_hours', 'settings_type_orders',
  'stock',
  'delivery_zones', 'delivery_areas', 'delivery_rate_test', 'delivery_routes', 'delivery_assignments',
  'notifications', 'announcements', 'notification_settings',
  'loyalty', 'coupons',
  'relatorio', 'sales_analysis', 'performance_customers',
  'users', 'delivery_persons',
  'printers',
  'whatsapp', 'disparos', 'ifood', 'ninetynine_food',
  'advanced_settings',
  'groups_access',
];

/** Features exclusivamente Pro (Growth+ mas não Basic) */
const PRO_FEATURE_KEYS = GROWTH_FEATURE_KEYS.filter((k) => !BASIC_FEATURE_KEYS.has(k));

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function seed() {
  console.log('🚀 Seed iniciado... Estratégia: Escalonamento por público-alvo');

  // ── Master User ────────────────────────────────────────────────────────────
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

  // ── Payment Methods ────────────────────────────────────────────────────────
  for (const method of paymentMethods) {
    await prisma.paymentMethod.upsert({
      where: { type: method.type },
      update: { name: method.name, isActive: method.isActive, icon: method.icon },
      create: { type: method.type, name: method.name, isActive: method.isActive, icon: method.icon },
    });
  }
  console.log('✅ Métodos de pagamento criados/atualizados');

  // ── Menu Groups ────────────────────────────────────────────────────────────
  const groupsData = [
    'Dashboard',
    'Operação',
    'Cardápio',
    'Funcionamento',
    'Clientes e Crescimento',
    'Equipes',
    'Automação',
    'Sistema',
  ];

  for (let i = 0; i < groupsData.length; i++) {
    const title = groupsData[i];
    const existing = await prisma.menuGroup.findFirst({ where: { title } });
    if (existing) {
      await prisma.menuGroup.update({
        where: { id: existing.id },
        data: { displayOrder: i + 1, active: true, title },
      });
    } else {
      await prisma.menuGroup.create({
        data: { title, displayOrder: i + 1, active: true },
      });
    }
  }
  console.log('✅ Menu Groups criados');

  const groups = await prisma.menuGroup.findMany();
  const getGroupId = (title: string) => groups.find((g) => g.title === title)?.id;

  // ── Main Features ──────────────────────────────────────────────────────────
  // Formato: [key, name, group, href, icon]
  const mainFeatures: Array<[string, string, string, string | null, string]> = [
    // DASHBOARD
    ['dashboard', 'Dashboard', 'Dashboard', '/admin/dashboard', 'LayoutDashboard'],

    // OPERAÇÃO
    ['pedidos',          'Pedidos',       'Operação', null,                   'ClipboardList'],
    ['caixa_pdv',        'Caixa PDV',     'Operação', null,                   'ShoppingCart'],
    ['salon',            'Salão',         'Operação', null,                   'UtensilsCrossed'],
    ['kitchen',          'Cozinha',       'Operação', '/admin/kitchen',        'ChefHat'],
    ['funcionamento_op', 'Funcionamento', 'Operação', null,                   'Clock'],

    // CARDÁPIO
    ['cardapio', 'Cardápio', 'Cardápio', null, 'BookOpen'],

    // FUNCIONAMENTO
    ['my_restaurant',  'Meu restaurante',  'Funcionamento', '/admin/administration/settings/profile',  'Building2'],
    ['delivery_zones', 'Taxas de Entrega', 'Funcionamento', null,                                      'Truck'],
    ['notifications',  'Notificações',     'Funcionamento', '/admin/notifications',                    'Bell'],

    // CLIENTES E CRESCIMENTO
    ['customers', 'Clientes',  'Clientes e Crescimento', '/admin/customers',            'Users'],
    ['loyalty',   'Fidelidade','Clientes e Crescimento', '/admin/loyalty',              'Star'],
    ['coupons',   'Cupons',    'Clientes e Crescimento', '/admin/financial/coupons',    'Tag'],
    ['relatorio', 'Relatório', 'Clientes e Crescimento', '/admin/performance/clientes', 'BarChart2'],

    // EQUIPES
    ['users',            'Usuários',    'Equipes', '/admin/users',                                'Users'],
    ['delivery_persons', 'Entregadores','Equipes', '/admin/delivery/persons',                     'Bike'],
    ['printers',         'Impressoras', 'Equipes', '/admin/administration/settings/printers',     'Printer'],

    // AUTOMAÇÃO
    ['whatsapp',       'WhatsApp',    'Automação', '/admin/automation/whatsapp', 'MessageCircle'],
    ['whatsapp_crm',   'WhatsApp CRM','Automação', '/admin/whatsapp-crm',        'MessageSquare'],
    ['disparos',       'Disparos',    'Automação', '/admin/automation/disparos', 'Send'],
    ['ifood',          'iFood',       'Automação', '/admin/automation/ifood',    'ShoppingBag'],
    ['ninetynine_food','99Food',      'Automação', '/admin/automation/99food',   'Bike'],

    // SISTEMA
    ['subscription',      'Assinatura',              'Sistema', '/admin/administration/settings/payments',   'CreditCard'],
    ['branches',          'Filiais',                 'Sistema', '/admin/administration/branches',            'Building2'],
    ['groups_access',     'Grupos de Acesso',        'Sistema', '/admin/administration/groups',             'Shield'],
    ['help',              'Ajuda',                   'Sistema', '/admin/help',                              'HelpCircle'],
    ['advanced_settings', 'Configurações Avançadas', 'Sistema', '/admin/administration/settings/advanced',  'Settings'],
    ['contact',           'Fale Conosco',            'Sistema', '/admin/contact',                           'MessageCircle'],
  ];

  const featureMap = new Map<string, string>();
  const pluginKeys = new Set(['whatsapp_crm']);

  for (const [featureKey, featureName, group, href, icon] of mainFeatures) {
    if (!featureKey) continue;

    const feature = await prisma.feature.upsert({
      where: { key: featureKey },
      update: {
        name: featureName,
        icon,
        href,
        active: true,
        isPlugin: pluginKeys.has(featureKey),
        isPro: PRO_FEATURE_KEYS.includes(featureKey),
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
      },
      create: {
        key: featureKey,
        name: featureName,
        icon,
        href,
        active: true,
        isPlugin: pluginKeys.has(featureKey),
        isPro: PRO_FEATURE_KEYS.includes(featureKey),
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
      },
    });

    featureMap.set(featureKey, feature.id);

    const groupId = getGroupId(group);
    if (groupId) {
      await prisma.featureMenuGroup.upsert({
        where: { featureId_groupId: { featureId: feature.id, groupId } },
        update: {},
        create: { featureId: feature.id, groupId },
      });
    }
  }

  console.log('✅ Features principais criadas (com icons + isPro)');

  // ── Sub Features ───────────────────────────────────────────────────────────
  // Formato: [key, name, parentKey, href, displayOrder]
  const subFeatures: Array<[string, string, string | null, string | null, number]> = [
    // PEDIDOS
    ['orders', 'Histórico de Pedidos', 'pedidos', '/admin/sales/orders', 1],
    ['kanban', 'Kanban de Pedidos',    'pedidos', '/admin/sales/kanban', 2],

    // CAIXA PDV
    ['pdv',  'PDV',                'caixa_pdv', '/admin/pdv',            1],
    ['cash', 'Abrir/Fechar Caixa', 'caixa_pdv', '/admin/financial/cash', 2],

    // SALÃO
    ['salon_tables',        'Mesas/Comandas',   'salon', '/admin/sales/tables',                            1],
    ['settings_service_fee','Taxa de Serviço',  'salon', '/admin/administration/settings/service-fee',     2],
    ['settings_tables',     'Config. Mesas',    'salon', '/admin/administration/settings/tables',          3],

    // COZINHA
    ['kds', 'KDS', 'kitchen', '/admin/sales/kds', 1],

    // FUNCIONAMENTO (Operação)
    ['settings_payment',     'Pagamento',      'funcionamento_op', '/admin/administration/settings/payment',      1],
    ['settings_hours',       'Horários',       'funcionamento_op', '/admin/administration/settings/hours',        2],
    ['settings_type_orders', 'Tipo de pedido', 'funcionamento_op', '/admin/administration/settings/type-orders',  3],

    // CARDÁPIO
    ['categories',        'Categorias',   'cardapio', '/admin/menu/categories',        1],
    ['products',          'Produtos',     'cardapio', '/admin/menu/products',           2],
    ['complements',       'Complementos', 'cardapio', '/admin/menu/complements',        3],
    ['complement_options','Opções',       'cardapio', '/admin/menu/complement-options', 4],
    ['stock',             'Estoque',      'cardapio', '/admin/menu/stock',              5],

    // TAXAS DE ENTREGA
    ['delivery_areas',       'Áreas de Entrega', 'delivery_zones', '/admin/delivery/areas',       1],
    ['delivery_rate_test',   'Teste de Frete',   'delivery_zones', '/admin/delivery/rate-test',   2],
    ['delivery_routes',      'Rotas',            'delivery_zones', '/admin/delivery/routes',      3],
    ['delivery_assignments', 'Atribuições',      'delivery_zones', '/admin/delivery/assignments', 4],

    // NOTIFICAÇÕES
    ['announcements',         'Avisos',         'notifications', '/admin/administration/settings/announcements',  1],
    ['notification_settings', 'Sons e Alertas', 'notifications', '/admin/administration/settings/notifications', 2],

    // RELATÓRIO
    ['sales_analysis',        'Vendas',    'relatorio', '/admin/performance/vendas',   1],
    ['performance_customers', 'Clientes',  'relatorio', '/admin/performance/clientes', 2],
  ];

  for (const [subKey, featureName, parentKey, href, displayOrder] of subFeatures) {
    if (!subKey || !featureName) {
      console.error(`❌ Key ou name inválidos: ${subKey}, ${featureName}`);
      continue;
    }

    const parentId = parentKey ? featureMap.get(parentKey) : undefined;

    if (parentKey && !parentId) {
      console.error(`❌ Parent feature não encontrada: ${parentKey} para ${subKey}`);
      continue;
    }

    const feature = await prisma.feature.upsert({
      where: { key: subKey },
      update: {
        name: featureName,
        href: href ?? undefined,
        parentId: parentId ?? undefined,
        displayOrder,
        active: true,
        isPro: PRO_FEATURE_KEYS.includes(subKey),
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
      },
      create: {
        key: subKey,
        name: featureName,
        href: href ?? undefined,
        parentId: parentId ?? undefined,
        displayOrder,
        active: true,
        isPro: PRO_FEATURE_KEYS.includes(subKey),
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
      },
    });

    featureMap.set(subKey, feature.id);

    // Herda o grupo do pai
    if (parentId) {
      const parentFeature = await prisma.feature.findUnique({
        where: { id: parentId },
        include: { featureMenuGroups: true },
      });

      if (parentFeature?.featureMenuGroups?.[0]) {
        const groupId = parentFeature.featureMenuGroups[0].groupId;
        await prisma.featureMenuGroup.upsert({
          where: { featureId_groupId: { featureId: feature.id, groupId } },
          update: {},
          create: { featureId: feature.id, groupId },
        });
      }
    }
  }

  console.log('✅ Subfeatures criadas (com isPro)');

  // ── Features de limite (internas, não aparecem no menu) ───────────────────
  const limitFeatureKeys = ['products', 'users', 'branches', 'monthly_orders'];
  for (const limitKey of limitFeatureKeys) {
    const existing = await prisma.feature.findUnique({ where: { key: limitKey } });
    if (!existing) {
      await prisma.feature.create({
        data: {
          key: limitKey,
          name: `Limite: ${limitKey}`,
          active: false,
          isPro: false,
          defaultActions: JSON.stringify([]),
        },
      });
    }
  }
  console.log('✅ Features de limite criadas (internas)');

  // ── Planos ─────────────────────────────────────────────────────────────────
  const plans = [
    {
      name: 'TRIAL',
      type: PlanType.TRIAL,
      price: 0,
      isTrial: true,
      trialDays: 7,
      isFeatured: false,
      displayOrder: 0,
      description: '7 dias grátis — Teste tudo sem limites',
      featureKeys: ['*'], // todas
    },
    {
      name: 'BÁSICO',
      type: PlanType.BASIC,
      price: 4990,
      isTrial: false,
      trialDays: 0,
      isFeatured: false,
      displayOrder: 1,
      description: 'Para lanchonetes e botecos — O essencial para vender',
      featureKeys: Array.from(BASIC_FEATURE_KEYS),
    },
    {
      name: 'GROWTH',
      type: PlanType.PREMIUM,
      price: 11990,
      isTrial: false,
      trialDays: 0,
      isFeatured: true,
      displayOrder: 2,
      description: 'Para pizzarias e restaurantes pequenos — Gerencie operação completa',
      featureKeys: GROWTH_FEATURE_KEYS,
    },
    {
      name: 'BUSINESS',
      type: PlanType.ENTERPRISE,
      price: 21990,
      isTrial: false,
      trialDays: 0,
      isFeatured: false,
      displayOrder: 3,
      description: 'Para distribuidoras e redes — Escale seu negócio',
      featureKeys: ['*'], // todas
    },
  ];

  for (const p of plans) {
    // Upsert do plano
    const existing = await prisma.plan.findFirst({ where: { type: p.type } });

    let plan: { id: string };
    if (existing) {
      plan = await prisma.plan.update({
        where: { id: existing.id },
        data: {
          name: p.name,
          type: p.type,
          price: p.price,
          description: p.description,
          billingPeriod: BillingPeriod.MONTHLY,
          isTrial: p.isTrial,
          trialDays: p.trialDays,
          isFeatured: p.isFeatured,
          displayOrder: p.displayOrder,
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
          isTrial: p.isTrial,
          trialDays: p.trialDays,
          isFeatured: p.isFeatured,
          displayOrder: p.displayOrder,
          active: true,
        },
      });
    }

    // Vincula as features ao plano
    const features =
      p.featureKeys.includes('*')
        ? await prisma.feature.findMany()
        : await prisma.feature.findMany({ where: { key: { in: p.featureKeys } } });

    for (const f of features) {
      await prisma.planFeature.upsert({
        where: { planId_featureId: { planId: plan.id, featureId: f.id } },
        update: {},
        create: { planId: plan.id, featureId: f.id },
      });
    }

    // Limites por plano
    const planLimits: Record<PlanType, { featureKey: string; name: string; maxValue: number; unit: string }[]> = {
      [PlanType.TRIAL]: [
        { featureKey: 'products',       name: 'Produtos',          maxValue: -1, unit: 'itens' },
        { featureKey: 'users',          name: 'Usuários',          maxValue: -1, unit: 'pessoas' },
        { featureKey: 'branches',       name: 'Filiais',           maxValue: -1, unit: 'filiais' },
        { featureKey: 'monthly_orders', name: 'Pedidos/mês',       maxValue: -1, unit: 'pedidos' },
      ],
      [PlanType.BASIC]: [
        { featureKey: 'products',       name: 'Produtos no cardápio', maxValue: 50,  unit: 'itens' },
        { featureKey: 'users',          name: 'Usuários',             maxValue: 2,   unit: 'pessoas' },
        { featureKey: 'branches',       name: 'Filiais',              maxValue: 1,   unit: 'filial' },
        { featureKey: 'monthly_orders', name: 'Pedidos/mês',          maxValue: -1,  unit: 'pedidos' },
      ],
      [PlanType.PREMIUM]: [
        { featureKey: 'products',       name: 'Produtos no cardápio', maxValue: 300, unit: 'itens' },
        { featureKey: 'users',          name: 'Usuários',             maxValue: 5,   unit: 'pessoas' },
        { featureKey: 'branches',       name: 'Filiais',              maxValue: 1,   unit: 'filial' },
        { featureKey: 'monthly_orders', name: 'Pedidos/mês',          maxValue: -1,  unit: 'pedidos' },
      ],
      [PlanType.ENTERPRISE]: [
        { featureKey: 'products',       name: 'Produtos no cardápio', maxValue: -1,  unit: 'itens' },
        { featureKey: 'users',          name: 'Usuários',             maxValue: 15,  unit: 'pessoas' },
        { featureKey: 'branches',       name: 'Filiais',              maxValue: -1,  unit: 'filiais' },
        { featureKey: 'monthly_orders', name: 'Pedidos/mês',          maxValue: -1,  unit: 'pedidos' },
      ],
    };

    for (const limit of planLimits[p.type]) {
      await prisma.featureLimit.upsert({
        where: { featureKey_planId: { featureKey: limit.featureKey, planId: plan.id } },
        update: { name: limit.name, maxValue: limit.maxValue, unit: limit.unit },
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

    console.log(`  ✅ Plano ${p.name} — ${features.length} features vinculadas`);
  }

  console.log('✅ Planos criados com limites');

  // ── isPro: atualização em massa ────────────────────────────────────────────
  // Marca isPro = true nas features exclusivas do Growth+
  const proUpdated = await prisma.feature.updateMany({
    where: { key: { in: PRO_FEATURE_KEYS } },
    data: { isPro: true },
  });

  // Garante isPro = false nas features do Basic e nas internas
  const freeUpdated = await prisma.feature.updateMany({
    where: {
      key: {
        in: [
          ...Array.from(BASIC_FEATURE_KEYS),
          ...limitFeatureKeys,
        ],
      },
    },
    data: { isPro: false },
  });

  console.log(
    `✅ isPro atualizado — ${proUpdated.count} features Pro, ${freeUpdated.count} features Free`,
  );

  // ── Add-ons ────────────────────────────────────────────────────────────────
  const addons = [
    {
      key: 'integration_platforms',
      name: 'Integração com Plataformas',
      description: 'Conecte com iFood, 99Food e outras plataformas de delivery',
      price: 3900,
      features: ['ifood', 'ninetynine_food'],
    },
    {
      key: 'delivery_advanced',
      name: 'Delivery Avançado',
      description: 'Rotas otimizadas, geolocalização, despachante automático',
      price: 4900,
      features: ['delivery_routes', 'delivery_assignments'],
    },
    {
      key: 'additional_branch',
      name: 'Filial Adicional',
      description: 'Adicione uma filial extra ao seu plano',
      price: 2900,
      features: ['branches'],
    },
    {
      key: 'analytics_enterprise',
      name: 'Analytics Enterprise',
      description: 'Relatórios avançados, BI, exportação de dados',
      price: 4900,
      features: ['sales_analysis', 'performance_customers'],
    },
    {
      key: 'priority_support',
      name: 'Suporte Prioritário',
      description: 'Chat prioritário, suporte via WhatsApp',
      price: 2900,
      features: [],
    },
  ];

  for (const addon of addons) {
    const existing = await prisma.addon.findFirst({ where: { key: addon.key } });

    let addonRecord: { id: string };
    if (existing) {
      addonRecord = await prisma.addon.update({
        where: { id: existing.id },
        data: { name: addon.name, description: addon.description, price: addon.price, active: true },
      });
    } else {
      addonRecord = await prisma.addon.create({
        data: { key: addon.key, name: addon.name, description: addon.description, price: addon.price, active: true },
      });
    }

    for (const featureKey of addon.features) {
      const feature = await prisma.feature.findUnique({ where: { key: featureKey } });
      if (feature) {
        await prisma.addonFeature.upsert({
          where: { addonId_featureId: { addonId: addonRecord.id, featureId: feature.id } },
          update: {},
          create: { addonId: addonRecord.id, featureId: feature.id },
        });
      }
    }

    console.log(`  ✅ Add-on "${addon.name}" criado/atualizado`);
  }

  console.log('✅ Add-ons criados');

  // ── Resumo ─────────────────────────────────────────────────────────────────
  const totalFeatures  = await prisma.feature.count();
  const totalPro       = await prisma.feature.count({ where: { isPro: true } });
  const totalFree      = await prisma.feature.count({ where: { isPro: false } });

  console.log('\n📊 RESUMO DO SEED:\n');
  console.log('🎯 PLANOS:');
  console.log('  • TRIAL    (7 dias)     — Tudo ilimitado');
  console.log('  • BÁSICO   (R$ 49/mês)  — Lanchonete/Boteco');
  console.log('  • GROWTH   (R$ 119/mês) — Pizzaria/Restaurante ⭐ Destaque');
  console.log('  • BUSINESS (R$ 219/mês) — Distribuidora/Rede');
  console.log('\n🔌 ADD-ONS:');
  console.log('  • Integração com plataformas  (R$ 39/mês)');
  console.log('  • Delivery avançado           (R$ 49/mês)');
  console.log('  • Filial adicional            (R$ 29/mês)');
  console.log('  • Analytics Enterprise        (R$ 49/mês)');
  console.log('  • Suporte prioritário         (R$ 29/mês)');
  console.log('\n🏷️  FEATURES isPro:');
  console.log(`  • Total de features : ${totalFeatures}`);
  console.log(`  • Features Pro      : ${totalPro}  (exclusivas Growth+)`);
  console.log(`  • Features Free     : ${totalFree} (disponíveis no Basic)`);
  console.log('\n✅ Seed finalizado com sucesso!\n');
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());