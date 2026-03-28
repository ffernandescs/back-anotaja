import { prisma } from '../lib/prisma';
import { hash } from 'bcryptjs';
import { PaymentMethodType, PlanType, BillingPeriod } from '@prisma/client';

async function seedMasterData() {
  console.log('🔧 Criando dados master do sistema...');

  try {
    // 1. Criar usuário Owner/Master
    const ownerEmail = 'master@anotaja.com';
    const ownerPassword = 'Master@123'; // Senha padrão, deve ser alterada

    const existingOwner = await prisma.masterUser.findUnique({
      where: { email: ownerEmail },
    });

    let masterUser;
    if (!existingOwner) {
      const hashedPassword = await hash(ownerPassword, 12);
      
      masterUser = await prisma.masterUser.create({
        data: {
          email: ownerEmail,
          password: hashedPassword,
          name: 'Master User',
          active: true,
        },
      });

      console.log('✅ Usuário master criado:', {
        email: masterUser.email,
        id: masterUser.id,
      });
    } else {
      masterUser = existingOwner;
      console.log('⏭️  Usuário master já existe');
    }

    // 2. Criar formas de pagamento master
    const paymentMethods = [
      {
        name: 'Dinheiro',
        type: PaymentMethodType.CASH,
        icon: 'Cash',
        isActive: true,
      },
      {
        name: 'Cartão de Crédito',
        type: PaymentMethodType.CREDIT,
        icon: 'CreditCard',
        isActive: true,
      },
      {
        name: 'Cartão de Débito',
        type: PaymentMethodType.DEBIT,
        icon: 'CreditCard',
        isActive: true,
      },
      {
        name: 'PIX',
        type: PaymentMethodType.PIX,
        icon: 'QrCode',
        isActive: true,
      },
      {
        name: 'Transferência Bancária',
        type: PaymentMethodType.ONLINE,
        icon: 'Bank',
        isActive: true,
      },
      {
        name: 'Vale Refeição',
        type: PaymentMethodType.MEAL_VOUCHER,
        icon: 'Ticket',
        isActive: true,
      },
      {
        name: 'Vale Alimentação',
        type: PaymentMethodType.FOOD_VOUCHER,
        icon: 'Ticket',
        isActive: true,
      },
    ];

    for (const paymentMethod of paymentMethods) {
      const existing = await prisma.paymentMethod.findFirst({
        where: { name: paymentMethod.name },
      });

      if (!existing) {
        await prisma.paymentMethod.create({
          data: paymentMethod,
        });
        console.log(`✅ Forma de pagamento criada: ${paymentMethod.name}`);
      } else {
        console.log(`⏭️  Forma de pagamento já existe: ${paymentMethod.name}`);
      }
    }

    // 3. Criar features master (usando o seed-features.ts existente)
    console.log('🔧 Criando features básicas do sistema com hierarquia');

    const mainFeatures = [
      {
        key: 'dashboard',
        name: 'Dashboard',
        description: 'Painel de controle com métricas e indicadores',
        href: '/admin/dashboard',
        icon: 'LayoutDashboard',
        defaultActions: JSON.stringify(['read']),
      },
      {
        key: 'catalog',
        name: 'Catálogo',
        description: 'Gestão completa do catálogo de produtos',
        icon: 'ShoppingCart',
        href: null, // Apenas agrupa
        defaultActions: JSON.stringify(['read']),
      },
      {
        key: 'sales',
        name: 'Vendas',
        description: 'Sistema completo de vendas e pedidos',
        icon: 'ShoppingBag',
        href: null, // Apenas agrupa
        defaultActions: JSON.stringify(['read']),
      },
      {
        key: 'operations',
        name: 'Operações',
        description: 'Gestão operacional do negócio',
        icon: 'Settings',
        href: null, // Apenas agrupa
        defaultActions: JSON.stringify(['read']),
      },
      {
        key: 'financial',
        name: 'Financeiro',
        description: 'Controle financeiro e relatórios',
        icon: 'DollarSign',
        href: null, // Apenas agrupa
        defaultActions: JSON.stringify(['read']),
      },
      {
        key: 'settings',
        name: 'Configurações',
        description: 'Configurações gerais do sistema',
        icon: 'Settings',
        href: null, // Apenas agrupa
        defaultActions: JSON.stringify(['read']),
      },
    ];

    const subFeatures = [
      // Subfeatures de Catálogo
      {
        key: 'product',
        name: 'Produtos',
        description: 'Gerenciamento de produtos e catálogo',
        href: '/admin/products',
        icon: 'Package',
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
        parentKey: 'catalog',
      },
      {
        key: 'category',
        name: 'Categorias',
        description: 'Gerenciamento de categorias de produtos',
        href: '/admin/categories',
        icon: 'Tag',
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
        parentKey: 'catalog',
      },
      {
        key: 'complement',
        name: 'Complementos',
        description: 'Gerenciamento de complementos e adicionais',
        href: '/admin/complements',
        icon: 'PlusCircle',
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
        parentKey: 'catalog',
      },
      
      // Subfeatures de Vendas
      {
        key: 'order',
        name: 'Pedidos',
        description: 'Gerenciamento de pedidos',
        href: '/admin/orders',
        icon: 'ShoppingCart',
        defaultActions: JSON.stringify(['read', 'update', 'delete']),
        parentKey: 'sales',
      },
      {
        key: 'kanban',
        name: 'Kanban de Pedidos',
        description: 'Gerenciamento de pedidos via kanban',
        href: '/admin/kanban',
        icon: 'LayoutGrid',
        defaultActions: JSON.stringify(['read', 'update', 'delete']),
        parentKey: 'sales',
      },
      {
        key: 'customer',
        name: 'Clientes',
        description: 'Gerenciamento de clientes',
        href: '/admin/customers',
        icon: 'Users',
        defaultActions: JSON.stringify(['create', 'read', 'update']),
        parentKey: 'sales',
      },
      {
        key: 'pdv',
        name: 'PDV',
        description: 'Ponto de venda digital',
        href: '/admin/pdv',
        icon: 'Monitor',
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete', 'manage']),
        parentKey: 'sales',
      },
      {
        key: 'kds',
        name: 'KDS',
        description: 'Kitchen Display System para cozinha',
        href: '/admin/kds',
        icon: 'ChefHat',
        defaultActions: JSON.stringify(['read', 'update', 'delete']),
        parentKey: 'sales',
      },
      
      // Subfeatures de Operações
      {
        key: 'stock',
        name: 'Estoque',
        description: 'Controle de estoque e produtos',
        href: '/admin/stock',
        icon: 'Package',
        defaultActions: JSON.stringify(['read', 'update', 'delete']),
        parentKey: 'operations',
      },
      {
        key: 'delivery',
        name: 'Entregas',
        description: 'Gestão de entregas e logística',
        href: '/admin/delivery',
        icon: 'Truck',
        defaultActions: JSON.stringify(['read', 'update', 'delete']),
        parentKey: 'operations',
      },
      {
        key: 'delivery_person',
        name: 'Entregadores',
        description: 'Cadastro e gestão de entregadores',
        href: '/admin/delivery-person',
        icon: 'User',
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
        parentKey: 'operations',
      },
      {
        key: 'delivery_area',
        name: 'Áreas de Entrega',
        description: 'Definição de áreas de entrega',
        href: '/admin/delivery-areas',
        icon: 'MapPin',
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
        parentKey: 'operations',
      },
      {
        key: 'delivery_route',
        name: 'Rotas de Entrega',
        description: 'Otimização de rotas de entrega',
        href: '/admin/delivery-routes',
        icon: 'Route',
        defaultActions: JSON.stringify(['read', 'update', 'delete']),
        parentKey: 'operations',
      },
      {
        key: 'payment_method',
        name: 'Métodos de Pagamento',
        description: 'Configuração de métodos de pagamento',
        href: '/admin/payment-methods',
        icon: 'CreditCard',
        defaultActions: JSON.stringify(['read', 'update', 'delete']),
        parentKey: 'operations',
      },
      {
        key: 'cash_session',
        name: 'Fluxo de Caixa SaaS PDV',
        description: 'Gestão completa de sessões de caixa com transferências, relatórios e multiusuário',
        href: '/admin/cash-register',
        icon: 'Wallet',
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete', 'manage', 'transfer', 'view_all', 'history', 'reports', 'dashboard']),
      },
      {
        key: 'coupons',
        name: 'Cupons',
        description: 'Criação e gestão de cupons de desconto',
        href: '/admin/coupons',
        icon: 'Ticket',
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
        parentKey: 'operations',
      },
      
      // Subfeatures de Financeiro
      {
        key: 'cash_history',
        name: 'Histórico de Caixa',
        description: 'Histórico completo de sessões e movimentações',
        href: '/admin/cash-register/history',
        icon: 'History',
        defaultActions: JSON.stringify(['read', 'export']),
        parentKey: 'operations',
      },
      {
        key: 'cash_reports',
        name: 'Relatórios de Caixa',
        description: 'Relatórios detalhados de fechamento e movimentações',
        href: '/admin/cash-register/reports',
        icon: 'FileText',
        defaultActions: JSON.stringify(['read', 'generate', 'export', 'email']),
        parentKey: 'operations',
      },
      {
        key: 'cash_dashboard',
        name: 'Dashboard de Caixa',
        description: 'Dashboard com KPIs e métricas em tempo real',
        href: '/admin/cash-register/dashboard',
        icon: 'BarChart',
        defaultActions: JSON.stringify(['read']),
        parentKey: 'operations',
      },
      {
        key: 'cash_shifts',
        name: 'Gestão de Turnos',
        description: 'Relatórios e gestão por turnos de trabalho',
        href: '/admin/cash-register/shifts',
        icon: 'Clock',
        defaultActions: JSON.stringify(['read', 'generate']),
        parentKey: 'operations',
      },
      {
        key: 'reports',
        name: 'Relatórios',
        description: 'Relatórios financeiros e de vendas',
        href: '/admin/reports',
        icon: 'FileText',
        defaultActions: JSON.stringify(['read']),
        parentKey: 'financial',
      },
      
      // Subfeatures de Configurações
      {
        key: 'user',
        name: 'Usuários',
        description: 'Gestão de usuários do sistema',
        href: '/admin/users',
        icon: 'Users',
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
        parentKey: 'settings',
      },
      {
        key: 'group',
        name: 'Grupos',
        description: 'Grupos de usuários e permissões',
        href: '/admin/groups',
        icon: 'Users2',
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
        parentKey: 'settings',
      },
      {
        key: 'branch',
        name: 'Filiais',
        description: 'Gestão de filiais e lojas',
        href: '/admin/branches',
        icon: 'Storefront',
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
        parentKey: 'settings',
      },
      {
        key: 'subscription',
        name: 'Assinatura',
        description: 'Gestão de assinaturas e planos',
        href: '/admin/subscription',
        icon: 'CreditCard',
        defaultActions: JSON.stringify(['read', 'update']),
        parentKey: 'settings',
      },
      {
        key: 'table',
        name: 'Mesas',
        description: 'Gestão de mesas para restaurantes',
        href: '/admin/tables',
        icon: 'Table',
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
        parentKey: 'settings',
      },
      {
        key: 'commands',
        name: 'Comandas',
        description: 'Controle de comandas de restaurantes',
        href: '/admin/commands',
        icon: 'ClipboardList',
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
        parentKey: 'settings',
      },
      {
        key: 'hours',
        name: 'Horários',
        description: 'Definição de horários de funcionamento',
        href: '/admin/hours',
        icon: 'Clock',
        defaultActions: JSON.stringify(['read', 'update', 'delete']),
        parentKey: 'settings',
      },
      {
        key: 'announcement',
        name: 'Anúncios',
        description: 'Criação de anúncios e banners',
        href: '/admin/announcements',
        icon: 'Megaphone',
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
        parentKey: 'settings',
      },
      {
        key: 'points',
        name: 'Pontos',
        description: 'Sistema de fidelidade e pontos',
        href: '/admin/points',
        icon: 'Award',
        defaultActions: JSON.stringify(['read', 'update', 'delete']),
        parentKey: 'settings',
      },
      {
        key: 'profile',
        name: 'Perfil',
        description: 'Perfil do usuário',
        href: '/admin/settings/profile',
        icon: 'User',
        defaultActions: JSON.stringify(['read', 'update']),
        parentKey: 'settings',
      },
    ];

    // Criar menu groups (categorias gerais)
    const menuGroups = [
      { title: 'Gestão', displayOrder: 1 },
      { title: 'Operações', displayOrder: 2 },
      { title: 'Financeiro', displayOrder: 3 },
      { title: 'Configurações', displayOrder: 4 },
      { title: 'Relatórios', displayOrder: 5 },
      { title: 'Outros', displayOrder: 6 },
    ];

    for (const groupData of menuGroups) {
      const existingGroup = await prisma.menuGroup.findFirst({
        where: { title: groupData.title }
      });

      if (!existingGroup) {
        await prisma.menuGroup.create({
          data: {
            title: groupData.title,
            displayOrder: groupData.displayOrder,
            active: true,
          },
        });
      }
    }

    console.log('✅ Menu groups criados');

    // Obter todos os menu groups criados
    const allMenuGroups = await prisma.menuGroup.findMany({
      orderBy: { displayOrder: 'asc' }
    });

    // Criar features principais primeiro
    const createdMainFeatures = new Map<string, string>(); // key -> id
    
    for (const featureData of mainFeatures) {
      const existingFeature = await prisma.feature.findUnique({
        where: { key: featureData.key },
      });

      if (!existingFeature) {
        const feature = await prisma.feature.create({
          data: {
            ...featureData,
            active: true,
          },
        });
        createdMainFeatures.set(featureData.key, feature.id);
        console.log(`✅ Feature principal criada: ${feature.name} (${feature.key})`);

        // Associar a menu groups apropriados
        let groupTitle = 'Outros';
        
        if (featureData.key === 'dashboard') {
          groupTitle = 'Gestão';
        } else if (['catalog'].includes(featureData.key)) {
          groupTitle = 'Gestão';
        } else if (['sales'].includes(featureData.key)) {
          groupTitle = 'Operações';
        } else if (['operations'].includes(featureData.key)) {
          groupTitle = 'Operações';
        } else if (['financial'].includes(featureData.key)) {
          groupTitle = 'Financeiro';
        } else if (['settings'].includes(featureData.key)) {
          groupTitle = 'Configurações';
        }

        const menuGroup = allMenuGroups.find(g => g.title === groupTitle);

        if (menuGroup) {
          await prisma.featureMenuGroup.create({
            data: {
              featureId: feature.id,
              groupId: menuGroup.id,
            },
          });
          console.log(`  📂 Associada ao grupo: ${groupTitle}`);
        }
      } else {
        createdMainFeatures.set(featureData.key, existingFeature.id);
        console.log(`⏭️  Feature principal já existe: ${featureData.name} (${featureData.key})`);
      }
    }

    // Criar subfeatures
    for (const featureData of subFeatures) {
      const existingFeature = await prisma.feature.findUnique({
        where: { key: featureData.key },
      });

      if (!existingFeature) {
        // Obter parentId da feature principal
        const parentKey = (featureData as any).parentKey;
        const parentId = createdMainFeatures.get(parentKey);
        
        if (!parentId) {
          console.error(`❌ Feature principal "${parentKey}" não encontrada para subfeature "${featureData.key}"`);
          continue;
        }

        const feature = await prisma.feature.create({
          data: {
            key: featureData.key,
            name: featureData.name,
            description: featureData.description,
            href: featureData.href,
            defaultActions: featureData.defaultActions,
            active: true,
            parentId: parentId,
          },
        });
        console.log(`✅ Subfeature criada: ${feature.name} (${feature.key})`);

        // Associar ao mesmo grupo do pai (não associar subfeatures individualmente)
        // Elas aparecerão como submenu no frontend
      } else {
        console.log(`⏭️  Subfeature já existe: ${featureData.name} (${featureData.key})`);
      }
    }

    console.log(`✅ ${await prisma.feature.count()} features criadas/atualizadas`);

    // 4. Criar planos padrão
    const plans = [
      {
        name: 'Plano Trial',
        type: PlanType.TRIAL,
        description: 'Plano gratuito para testar o sistema',
        price: 0,
        billingPeriod: BillingPeriod.MONTHLY,
        isTrial: true,
        trialDays: 7,
        limits: JSON.stringify({
          branches: 1,
          users: 2,
          products: 10,
          ordersPerMonth: 50,
          deliveryPersons: 1,
        }),
        features: JSON.stringify(['dashboard', 'product', 'order', 'customer', 'pdv']),
        active: true,
        displayOrder: 1,
      },
      {
        name: 'Plano Básico',
        type: PlanType.BASIC,
        description: 'Ideal para pequenos negócios',
        price: 99.9,
        billingPeriod: BillingPeriod.MONTHLY,
        trialDays: 0,
        limits: JSON.stringify({
          branches: 1,
          users: 3,
          products: 200,
          ordersPerMonth: 500,
          deliveryPersons: 2,
        }),
        features: JSON.stringify(['dashboard', 'product', 'category', 'order', 'customer', 'pdv', 'stock', 'reports']),
        active: true,
        displayOrder: 2,
      },
      {
        name: 'Plano Profissional',
        type: PlanType.PREMIUM,
        description: 'Recursos avançados para negócios em crescimento',
        price: 299.9,
        billingPeriod: BillingPeriod.MONTHLY,
        trialDays: 0,
        limits: JSON.stringify({
          branches: 3,
          users: 10,
          products: 1000,
          ordersPerMonth: 2000,
          deliveryPersons: 5,
        }),
        features: JSON.stringify(['dashboard', 'product', 'category', 'complement', 'order', 'customer', 'pdv', 'kds', 'stock', 'delivery', 'delivery_person', 'delivery_area', 'payment_method', 'cash_session', 'cash_history', 'cash_reports', 'cash_dashboard', 'cash_shifts', 'coupons', 'reports', 'analytics', 'user', 'group', 'branch']),
        active: true,
        displayOrder: 3,
      },
      {
        name: 'Plano Enterprise',
        type: PlanType.ENTERPRISE,
        description: 'Solução completa para grandes empresas',
        price: 599.9,
        billingPeriod: BillingPeriod.MONTHLY,
        trialDays: 0,
        limits: JSON.stringify({
          branches: -1, // ilimitado
          users: -1,
          products: -1,
          ordersPerMonth: -1,
          deliveryPersons: -1,
        }),
        features: JSON.stringify(['*']), // todas as features
        active: true,
        displayOrder: 4,
      },
    ];

    for (const planData of plans) {
      const existingPlan = await prisma.plan.findFirst({
        where: { type: planData.type },
      });

      if (!existingPlan) {
        const plan = await prisma.plan.create({
          data: planData,
        });
        console.log(`✅ Plano criado: ${plan.name}`);

        // Associar features ao plano
        if (planData.features) {
          const featuresToAssociate = planData.features === '["*"]' 
            ? await prisma.feature.findMany({ where: { active: true } })
            : await prisma.feature.findMany({
                where: { 
                  key: { in: JSON.parse(planData.features) },
                  active: true 
                }
              });

          for (const feature of featuresToAssociate) {
            await prisma.planFeature.create({
              data: {
                planId: plan.id,
                featureId: feature.id,
              },
            });
          }

          console.log(`  📋 ${featuresToAssociate.length} features associadas ao plano`);
        }
      } else {
        console.log(`⏭️  Plano já existe: ${planData.name}`);
      }
    }

    console.log('\n🎉 Dados master criados com sucesso!');
    console.log('\n📋 Resumo:');
    console.log(`  👤 Usuário Master: ${masterUser.email}`);
    console.log(`  💳 Formas de Pagamento: ${await prisma.paymentMethod.count()}`);
    console.log(`  ⚙️  Features: ${await prisma.feature.count()}`);
    console.log(`  📋 Planos: ${await prisma.plan.count()}`);
    console.log('\n🔑 Acesso Master:');
    console.log(`  Email: ${ownerEmail}`);
    console.log(`  Senha: ${ownerPassword}`);
    console.log('\n⚠️  Não se esqueça de alterar a senha do usuário master!');

  } catch (error) {
    console.error('❌ Erro ao criar dados master:', error);
    throw error;
  }
}

async function main() {
  await seedMasterData();
}

main()
  .catch((e) => {
    console.error('❌ Erro ao executar seed master:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
