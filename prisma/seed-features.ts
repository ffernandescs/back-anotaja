import { prisma } from '../lib/prisma';

async function seedFeatures() {
  console.log('🔧 Criando features básicas do sistema...');

  const features = [
    // Dashboard
    {
      key: 'dashboard',
      name: 'Dashboard',
      description: 'Painel principal com métricas e indicadores',
      href: '/admin/dashboard',
      defaultActions: JSON.stringify(['read', 'manage']),
    },
    
    // Produtos e Catálogo
    {
      key: 'product',
      name: 'Produtos',
      description: 'Gerenciamento de produtos e catálogo',
      href: '/admin/products',
      defaultActions: JSON.stringify(['create', 'read', 'update', 'delete', 'manage']),
    },
    {
      key: 'category',
      name: 'Categorias',
      description: 'Gerenciamento de categorias de produtos',
      href: '/admin/categories',
      defaultActions: JSON.stringify(['create', 'read', 'update', 'delete', 'manage']),
    },
    {
      key: 'complement',
      name: 'Complementos',
      description: 'Gerenciamento de complementos e adicionais',
      href: '/admin/complements',
      defaultActions: JSON.stringify(['create', 'read', 'update', 'delete', 'manage']),
    },
    
    // Vendas e Pedidos
    {
      key: 'order',
      name: 'Pedidos',
      description: 'Gerenciamento de pedidos',
      href: '/admin/orders',
      defaultActions: JSON.stringify(['create', 'read', 'update', 'delete', 'manage']),
    },
    {
      key: 'customer',
      name: 'Clientes',
      description: 'Gerenciamento de clientes',
      href: '/admin/customers',
      defaultActions: JSON.stringify(['create', 'read', 'update', 'delete', 'manage']),
    },
    {
      key: 'pdv',
      name: 'PDV',
      description: 'Ponto de Venda',
      href: '/admin/pdv',
      defaultActions: JSON.stringify(['create', 'read', 'update', 'delete', 'manage']),
    },
    {
      key: 'kds',
      name: 'KDS',
      description: 'Kitchen Display System',
      href: '/admin/kds',
      defaultActions: JSON.stringify(['read', 'manage']),
    },
    
    // Operações
    {
      key: 'stock',
      name: 'Estoque',
      description: 'Controle de estoque',
      href: '/admin/stock',
      defaultActions: JSON.stringify(['create', 'read', 'update', 'delete', 'manage']),
    },
    {
      key: 'delivery',
      name: 'Entregas',
      description: 'Gerenciamento de entregadores e rotas',
      href: '/admin/delivery',
      defaultActions: JSON.stringify(['create', 'read', 'update', 'delete', 'manage']),
    },
    {
      key: 'delivery_person',
      name: 'Entregadores',
      description: 'Cadastro de entregadores',
      href: '/admin/delivery-person',
      defaultActions: JSON.stringify(['create', 'read', 'update', 'delete', 'manage']),
    },
    {
      key: 'delivery_area',
      name: 'Áreas de Entrega',
      description: 'Definição de áreas de entrega',
      href: '/admin/delivery-areas',
      defaultActions: JSON.stringify(['create', 'read', 'update', 'delete', 'manage']),
    },
    {
      key: 'delivery_route',
      name: 'Rotas de Entrega',
      description: 'Otimização de rotas de entrega',
      href: '/admin/delivery-routes',
      defaultActions: JSON.stringify(['create', 'read', 'update', 'delete', 'manage']),
    },
    
    // Financeiro
    {
      key: 'payment_method',
      name: 'Métodos de Pagamento',
      description: 'Configuração de métodos de pagamento',
      href: '/admin/payment-methods',
      defaultActions: JSON.stringify(['create', 'read', 'update', 'delete', 'manage']),
    },
    {
      key: 'cash_register',
      name: 'Caixa',
      description: 'Gerenciamento de caixa',
      href: '/admin/cash-register',
      defaultActions: JSON.stringify(['create', 'read', 'update', 'delete', 'manage']),
    },
    {
      key: 'coupons',
      name: 'Cupons',
      description: 'Gerenciamento de cupons de desconto',
      href: '/admin/coupons',
      defaultActions: JSON.stringify(['create', 'read', 'update', 'delete', 'manage']),
    },
    
    // Usuários e Permissões
    {
      key: 'user',
      name: 'Usuários',
      description: 'Gerenciamento de usuários do sistema',
      href: '/admin/users',
      defaultActions: JSON.stringify(['create', 'read', 'update', 'delete', 'manage']),
    },
    {
      key: 'group',
      name: 'Grupos',
      description: 'Gerenciamento de grupos e permissões',
      href: '/admin/groups',
      defaultActions: JSON.stringify(['create', 'read', 'update', 'delete', 'manage']),
    },
    {
      key: 'branch',
      name: 'Filiais',
      description: 'Gerenciamento de filiais',
      href: '/admin/branches',
      defaultActions: JSON.stringify(['create', 'read', 'update', 'delete', 'manage']),
    },
    
    // Configurações
    {
      key: 'company',
      name: 'Empresa',
      description: 'Configurações da empresa',
      href: '/admin/company',
      defaultActions: JSON.stringify(['read', 'update', 'manage']),
    },
    {
      key: 'subscription',
      name: 'Assinatura',
      description: 'Gerenciamento de assinatura e plano',
      href: '/admin/settings/payments',
      defaultActions: JSON.stringify(['read', 'update', 'manage']),
    },
    {
      key: 'settings',
      name: 'Configurações',
      description: 'Configurações gerais do sistema',
      href: '/admin/settings',
      defaultActions: JSON.stringify(['read', 'update', 'manage']),
    },
    
    // Relatórios
    {
      key: 'reports',
      name: 'Relatórios',
      description: 'Relatórios e análises',
      href: '/admin/reports',
      defaultActions: JSON.stringify(['read', 'manage']),
    },
    {
      key: 'analytics',
      name: 'Análises',
      description: 'Análises avançadas',
      href: '/admin/analytics',
      defaultActions: JSON.stringify(['read', 'manage']),
    },
    
    // Features Enterprise
    {
      key: 'api',
      name: 'API',
      description: 'Acesso à API',
      href: '/admin/api',
      defaultActions: JSON.stringify(['read', 'manage']),
    },
    {
      key: 'support',
      name: 'Suporte',
      description: 'Suporte prioritário',
      href: '/admin/support',
      defaultActions: JSON.stringify(['read']),
    },
    {
      key: 'custom',
      name: 'Customizações',
      description: 'Customizações avançadas',
      href: '/admin/custom',
      defaultActions: JSON.stringify(['read', 'update', 'manage']),
    },
    
    // Features Adicionais
    {
      key: 'table',
      name: 'Mesas',
      description: 'Gerenciamento de mesas',
      href: '/admin/tables',
      defaultActions: JSON.stringify(['create', 'read', 'update', 'delete', 'manage']),
    },
    {
      key: 'commands',
      name: 'Comandas',
      description: 'Gerenciamento de comandas',
      href: '/admin/commands',
      defaultActions: JSON.stringify(['create', 'read', 'update', 'delete', 'manage']),
    },
    {
      key: 'hours',
      name: 'Horários',
      description: 'Configuração de horários de funcionamento',
      href: '/admin/hours',
      defaultActions: JSON.stringify(['create', 'read', 'update', 'delete', 'manage']),
    },
    {
      key: 'announcement',
      name: 'Anúncios',
      description: 'Gerenciamento de anúncios',
      href: '/admin/announcements',
      defaultActions: JSON.stringify(['create', 'read', 'update', 'delete', 'manage']),
    },
    {
      key: 'points',
      name: 'Pontos',
      description: 'Sistema de pontos/fidelidade',
      href: '/admin/points',
      defaultActions: JSON.stringify(['create', 'read', 'update', 'delete', 'manage']),
    },
    {
      key: 'profile',
      name: 'Perfil',
      description: 'Perfil do usuário',
      href: '/admin/profile',
      defaultActions: JSON.stringify(['read', 'update']),
    },
  ];

  // Criar menu groups
  const menuGroups = [
    { title: 'Principal', displayOrder: 1 },
    { title: 'Produtos e Catálogo', displayOrder: 2 },
    { title: 'Vendas', displayOrder: 3 },
    { title: 'Operações', displayOrder: 4 },
    { title: 'Financeiro', displayOrder: 5 },
    { title: 'Configurações', displayOrder: 6 },
    { title: 'Relatórios', displayOrder: 7 },
    { title: 'Enterprise', displayOrder: 8 },
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

  // Criar features
  for (const featureData of features) {
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
      console.log(`✅ Feature criada: ${feature.name} (${feature.key})`);

      // Associar a menu groups apropriados
      let groupTitle = 'Outros';
      
      if (['dashboard'].includes(featureData.key)) {
        groupTitle = 'Principal';
      } else if (['product', 'category', 'complement'].includes(featureData.key)) {
        groupTitle = 'Produtos e Catálogo';
      } else if (['order', 'customer', 'pdv', 'kds', 'table', 'commands'].includes(featureData.key)) {
        groupTitle = 'Vendas';
      } else if (['stock', 'delivery', 'delivery_person', 'delivery_area', 'delivery_route'].includes(featureData.key)) {
        groupTitle = 'Operações';
      } else if (['payment_method', 'cash_register', 'coupons'].includes(featureData.key)) {
        groupTitle = 'Financeiro';
      } else if (['user', 'group', 'branch', 'company', 'subscription', 'settings', 'hours', 'profile', 'announcement'].includes(featureData.key)) {
        groupTitle = 'Configurações';
      } else if (['reports', 'analytics'].includes(featureData.key)) {
        groupTitle = 'Relatórios';
      } else if (['api', 'support', 'custom', 'points'].includes(featureData.key)) {
        groupTitle = 'Enterprise';
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
      console.log(`⏭️  Feature já existe: ${featureData.name} (${featureData.key})`);
    }
  }

  console.log(`✅ ${await prisma.feature.count()} features criadas/atualizadas`);
}

async function main() {
  await seedFeatures();
}

main()
  .catch((e) => {
    console.error('❌ Erro ao executar seed de features:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
