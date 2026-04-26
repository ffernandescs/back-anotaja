import { Injectable } from '@nestjs/common';
import { prisma } from '../../../lib/prisma';

@Injectable()
export class CreateFeaturesService {
  async createBasicFeatures() {

    const features = [
      {
        key: 'dashboard',
        name: 'Dashboard',
        description: 'Painel principal com métricas e indicadores',
        href: '/admin/dashboard',
        defaultActions: JSON.stringify(['read']),
      },
      {
        key: 'product',
        name: 'Produtos',
        description: 'Gerenciamento de produtos e catálogo',
        href: '/admin/products',
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
      },
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
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
      },
      {
        key: 'subscription',
        name: 'Assinatura',
        description: 'Gerenciamento de assinatura e plano',
        href: '/admin/settings/payments',
        defaultActions: JSON.stringify(['read', 'update']),
      },
      {
        key: 'order',
        name: 'Pedidos',
        description: 'Gerenciamento de pedidos',
        href: '/admin/orders',
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
      },
      {
        key: 'customer',
        name: 'Clientes',
        description: 'Gerenciamento de clientes',
        href: '/admin/customers',
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
      },
      {
        key: 'category',
        name: 'Categorias',
        description: 'Gerenciamento de categorias de produtos',
        href: '/admin/categories',
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
      },
      {
        key: 'reports',
        name: 'Relatórios',
        description: 'Relatórios e análises',
        href: '/admin/reports',
        defaultActions: JSON.stringify(['read']),
      },
      {
        key: 'delivery',
        name: 'Entregas',
        description: 'Gerenciamento de entregadores e rotas',
        href: '/admin/delivery',
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
      },
      {
        key: 'stock',
        name: 'Estoque',
        description: 'Controle de estoque',
        href: '/admin/stock',
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
      },
      {
        key: 'coupons',
        name: 'Cupons',
        description: 'Gerenciamento de cupons de desconto',
        href: '/admin/coupons',
        defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
      },
      {
        key: 'api',
        name: 'API',
        description: 'Acesso à API',
        href: '/admin/api',
        defaultActions: JSON.stringify(['read', 'manage']),
      },
      {
        key: 'analytics',
        name: 'Análises',
        description: 'Análises avançadas',
        href: '/admin/analytics',
        defaultActions: JSON.stringify(['read']),
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
        defaultActions: JSON.stringify(['read', 'update']),
      },
      {
        key: 'whatsapp',
        name: 'WhatsApp',
        description: 'Integração WhatsApp via Evolution API',
        icon: 'MessageCircle',
        href: '/admin/automation/whatsapp',
        defaultActions: JSON.stringify(['read', 'update', 'manage']),
      },
    ];

    // Criar menu groups
    const menuGroups = [
      { title: 'Principal', displayOrder: 1 },
      { title: 'Produtos e Catálogo', displayOrder: 2 },
      { title: 'Vendas', displayOrder: 3 },
      { title: 'Operações', displayOrder: 4 },
      { title: 'Configurações', displayOrder: 5 },
      { title: 'Relatórios', displayOrder: 6 },
      { title: 'Automação', displayOrder: 7 },
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

        // Associar a menu groups apropriados
        let groupTitle = 'Outros';
        
        if (['dashboard'].includes(featureData.key)) {
          groupTitle = 'Principal';
        } else if (['product', 'category'].includes(featureData.key)) {
          groupTitle = 'Produtos e Catálogo';
        } else if (['order', 'customer', 'delivery'].includes(featureData.key)) {
          groupTitle = 'Vendas';
        } else if (['user', 'group'].includes(featureData.key)) {
          groupTitle = 'Configurações';
        } else if (['stock'].includes(featureData.key)) {
          groupTitle = 'Operações';
        } else if (['reports', 'analytics'].includes(featureData.key)) {
          groupTitle = 'Relatórios';
        } else if (['subscription', 'coupons', 'api', 'support', 'custom'].includes(featureData.key)) {
          groupTitle = 'Configurações';
        } else if (['whatsapp'].includes(featureData.key)) {
          groupTitle = 'Automação';
        }

        const menuGroup = allMenuGroups.find(g => g.title === groupTitle);

        if (menuGroup) {
          await prisma.featureMenuGroup.create({
            data: {
              featureId: feature.id,
              groupId: menuGroup.id,
            },
          });
        }
      }
    }

    
    return { success: true, message: 'Features criadas com sucesso' };
  }
}
