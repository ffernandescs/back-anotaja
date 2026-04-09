// ✅ SEED FINAL — 3 NÍVEIS (SAAS PDV + DELIVERY)

import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';
import { BillingPeriod, PlanType } from '@prisma/client';


export enum PaymentMethodType {
  CASH = 'CASH',
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
  PIX = 'PIX',
  BOLETO = 'BOLETO',
  MEAL_VOUCHER = 'MEAL_VOUCHER', // VA
  FOOD_VOUCHER = 'FOOD_VOUCHER', // VE
  OTHER = 'OTHER',
  ONLINE = 'ONLINE',
}

const paymentMethods = [
  {
    id: PaymentMethodType.CASH,
    name: 'Dinheiro',
    isActive: true,
    type: PaymentMethodType.CASH,
  },
  {
    id: PaymentMethodType.CREDIT,
    name: 'Cartão de Crédito',
    isActive: true,
    type: PaymentMethodType.CREDIT,
  },
  {
    id: PaymentMethodType.DEBIT,
    name: 'Cartão de Débito',
    isActive: true,
    type: PaymentMethodType.DEBIT,
  },
  {
    id: PaymentMethodType.PIX,
    name: 'PIX',
    isActive: true,
    type: PaymentMethodType.PIX,
  },
  {
    id: PaymentMethodType.ONLINE,
    name: 'Pagamento Online',
    isActive: true,
    type: PaymentMethodType.ONLINE,
  },
];

async function seed() {
  console.log('🚀 Seed iniciado...');

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


   for (const method of paymentMethods) {
      await prisma.paymentMethod.upsert({
        where: { id: method.id },
        update: {},
        create: {
          ...method,
        },
      });
    }

    console.log(
    `✅ ${await prisma.paymentMethod.count()} métodos de pagamento criados/atualizados`,
  );
  // ======================================================
  // MENU GROUPS
  // ======================================================
  const groupsData = [
    'Dashboard',
    'Vendas',
    'Cardápio',
    'Delivery',
    'Operação',
    'Financeiro',
    'Relatórios',
    'Clientes',
    'Administração',
  ];

  for (let i = 0; i < groupsData.length; i++) {
    const existingGroup = await prisma.menuGroup.findFirst({
      where: { title: groupsData[i] }
    });

    if (existingGroup) {
      await prisma.menuGroup.update({
        where: { id: existingGroup.id },
        data: { displayOrder: i + 1, active: true },
      });
    } else {
      await prisma.menuGroup.create({
        data: {
          title: groupsData[i],
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
  // FEATURES (NÍVEL 2 - agora são as features principais dentro dos grupos)
  // ======================================================
  const rootFeatures = [
    ['dashboard', 'Dashboard', 'Dashboard'],
    
    // Vendas - agora são features dentro do grupo Vendas
    ['sales_attendance', 'Atendimento', 'Vendas'],
    ['sales_hall', 'Salão', 'Vendas'],
    ['sales_kitchen', 'Cozinha', 'Vendas'],
    
    // Cardápio - agora são features dentro do grupo Cardápio
    ['menu_management', 'Gestão', 'Cardápio'],
    
    // Delivery - agora são features dentro do grupo Delivery
    ['delivery_orders_group', 'Pedidos', 'Delivery'],
    ['delivery_management', 'Gestão de Delivery', 'Delivery'],
    
    // Operação - agora são features dentro do grupo Operação
    ['operations', 'Operação', 'Operação'],
    
    // Financeiro - agora são features dentro do grupo Financeiro
    ['financial_cash', 'Caixa', 'Financeiro'],
    ['financial_management', 'Gestão Financeira', 'Financeiro'],
    
    // Relatórios - agora são features dentro do grupo Relatórios
    ['reports', 'Relatórios', 'Relatórios'],
    
    // Clientes - agora são features dentro do grupo Clientes
    ['customers', 'Clientes', 'Clientes'],
    
    // Administração - agora são features dentro do grupo Administração
    ['admin_access', 'Acesso', 'Administração'],
    ['settings_management', 'Configurações', 'Administração'],
  ];

  const featureMap = new Map<string, string>();

  for (const [key, name, group] of rootFeatures) {
    const feature = await prisma.feature.upsert({
      where: { key },
      update: {
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
      },
      create: {
        key,
        name,
        href: key === 'dashboard' ? '/admin/dashboard' : null, // Dashboard tem href, outras não
        active: true,
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
      },
    });

    featureMap.set(key, feature.id);

    const groupId = getGroupId(group);
    if (groupId) {
      await prisma.featureMenuGroup.upsert({
        where: {
          featureId_groupId: { featureId: feature.id, groupId },
        },
        update: {},
        create: { featureId: feature.id, groupId },
      });
    }
  }

  console.log('✅ Features principais criadas');

  // ======================================================
  // SUBFEATURES (NÍVEL 3 - agora são subfeatures das features)
  // Formato: [key, name, parentKey, href, displayOrder]
  const subFeatures: [string, string, string | null, string | null, number][] = [
    // 🧾 VENDAS - Subfeatures das features de vendas
    ['orders', 'Pedidos', 'sales_attendance', '/admin/sales/orders', 1],
    ['kanban', 'Kanban', 'sales_attendance', '/admin/sales/kanban', 2],
    ['pdv', 'PDV', 'sales_attendance', '/admin/sales/pdv', 3],

    ['commands', 'Comandas', 'sales_hall', '/admin/sales/commands', 1],
    ['tables', 'Mesas', 'sales_hall', '/admin/sales/tables', 2],

    ['kds', 'KDS', 'sales_kitchen', '/admin/sales/kds', 1],

    // 🍔 CARDÁPIO - Subfeatures das features de cardápio
    ['products', 'Produtos', 'menu_management', '/admin/menu/products', 1],
    ['categories', 'Categorias', 'menu_management', '/admin/menu/categories', 2],
    ['ingredients', 'Ingredientes', 'menu_management', '/admin/menu/ingredients', 3],
    ['complements', 'Complementos', 'menu_management', '/admin/menu/complements', 4],
    ['complement_options', 'Opções de Complemento', 'menu_management', '/admin/menu/complement-options', 5],
    ['stock', 'Estoque', 'menu_management', '/admin/menu/stock', 4],

    // 🍔 OPÇÕES DE COMPLEMENTO - Subfeatures das features de opções de complemento

    // 🚚 DELIVERY - Subfeatures das features de delivery
    ['delivery_areas', 'Áreas de Entrega', 'delivery_orders_group', '/admin/delivery/areas', 1],
    ['delivery_persons', 'Entregadores', 'delivery_orders_group', '/admin/delivery/persons', 2],
    ['delivery_routes', 'Rotas de Entrega', 'delivery_orders_group', '/admin/delivery/routes', 3],
    ['delivery_assignments', 'Atribuições', 'delivery_orders_group', '/admin/delivery/assignments', 4],

    // 💰 FINANCEIRO - Subfeatures das features de financeiro
    ['cash', 'Caixa', 'financial_cash', '/admin/financial/cash', 1],
    ['payment_methods', 'Métodos de Pagamento', 'financial_management', '/admin/financial/methods', 2],
    ['coupons', 'Cupons', 'financial_management', '/admin/financial/coupons', 3],

    // ⚙️ ADMINISTRAÇÃO - Subfeatures das features de admin
    ['users', 'Usuários', 'admin_access', '/admin/users', 1],
    ['branches', 'Filiais', 'admin_access', '/admin/administration/branches', 2],
    ['groups', 'Grupos', 'admin_access', '/admin/administration/groups', 3],

    // ⚙️ CONFIGURAÇÕES - Subfeatures das features de configurações
    ['settings_profile', 'Perfil da Empresa', 'settings_management', '/admin/administration/settings/profile', 1],
    ['settings_hours', 'Horários', 'settings_management', '/admin/administration/settings/hours', 2],
    ['settings_payment', 'Forma de Pagamento', 'settings_management', '/admin/administration/settings/payment', 3],
    ['settings_service_fee', 'Taxa de Serviço', 'settings_management', '/admin/administration/settings/service-fee', 4],
    ['settings_announcements', 'Avisos', 'settings_management', '/admin/administration/settings/announcements', 5],
    ['settings_subscription', 'Assinatura', 'settings_management', '/admin/administration/settings/payments', 6],
    ['settings_printer', 'Impressoras', 'settings_management', '/admin/administration/settings/printer', 7],
  ];

  for (const [key, name, parentKey, href, displayOrder] of subFeatures) {
    // Garante que key e name nunca são null
    if (!key || !name) {
      console.error(`❌ Key ou name inválidos: ${key}, ${name}`);
      continue;
    }

    // Se parentKey for null, é uma feature de nível 1 (categoria)
    if (!parentKey) {
      const feature = await prisma.feature.upsert({
        where: { key },
        update: {
          name,
          href: href || undefined,
          displayOrder: displayOrder || 0,
          active: true,
          defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
        },
        create: {
          key,
          name,
          href: href || undefined,
          displayOrder: displayOrder || 0,
          active: true,
          defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
        },
      });
      
      featureMap.set(key, feature.id);
      continue;
    }

    // Se parentKey não for null, é uma subfeature (nível 2+)
    const parentId = featureMap.get(parentKey);
    
    if (!parentId) {
      console.error(`❌ Parent feature não encontrada: ${parentKey} para ${key}`);
      continue;
    }

    const feature = await prisma.feature.upsert({
      where: { key },
      update: {
        name,
        href: href || undefined,
        parentId,
        displayOrder: displayOrder || 0,
        active: true,
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
      },
      create: {
        key,
        name,
        href: href || undefined,
        parentId,
        displayOrder: displayOrder || 0,
        active: true,
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
      },
    });

    // ✅ Associar subfeature ao mesmo grupo da feature principal
    if (parentId) {
      // Encontrar o grupo da feature principal
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

    featureMap.set(key, feature.id);
  }

  console.log('✅ Subfeatures criadas');

  // ======================================================
  // PLANOS (AJUSTADO)
  // ======================================================
  const plans = [
    {
      name: 'TRIAL',
      type: PlanType.TRIAL,
      price: 0,
      isTrial: true,
      trialDays: 7,
      features: ['*'], // TODAS as features no trial
    },
    {
      name: 'BASIC',
      type: PlanType.BASIC,
      price: 99.9,
      features: ['dashboard', 'orders', 'kanban', 'pdv', 'products', 'categories', 'settings_printer'], // keys corrigidas
    },
    {
      name: 'PREMIUM',
      type: PlanType.PREMIUM,
      price: 299.9,
      features: ['*'], // todas as features
    },
  ];

  for (const p of plans) {
    const existingPlan = await prisma.plan.findFirst({
      where: { type: p.type }
    });

    let plan;
    if (existingPlan) {
      plan = await prisma.plan.update({
        where: { id: existingPlan.id },
        data: {
          name: p.name,
          type: p.type,
          price: p.price,
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
  }

  console.log('✅ Planos criados');
  console.log('🎉 Seed finalizado!');
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());