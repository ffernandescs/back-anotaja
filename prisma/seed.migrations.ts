import { prisma } from '../lib/prisma';

async function migrateRoles() {
  const branches = await prisma.branch.findMany({
    include: {
      users: true, // 👈 já traz usuários
    },
  });

  for (const branch of branches) {
    // 🔹 ADMIN
    const adminGroup = await prisma.group.upsert({
      where: {
        branchId_name: {
          branchId: branch.id,
          name: 'Administrador',
        },
      },
      update: {},
      create: {
        name: 'Administrador',
        branchId: branch.id,
      },
    });

    // 🔹 OPERADOR
    const operatorGroup = await prisma.group.upsert({
      where: {
        branchId_name: {
          branchId: branch.id,
          name: 'Operador',
        },
      },
      update: {},
      create: {
        name: 'Operador',
        branchId: branch.id,
        isDefault: true,
      },
    });

    // 🔥 limpa permissões antigas dos grupos
    await prisma.permission.deleteMany({
      where: {
        groupId: {
          in: [adminGroup.id, operatorGroup.id],
        },
      },
    });

    // 🔥 recria permissões dos grupos
    await prisma.permission.createMany({
      data: [
        // ADMIN
        {
          action: 'manage',
          subject: 'all', // ✅ corrigido
          groupId: adminGroup.id,
        },

        // OPERADOR
        {
          action: 'manage',
          subject: 'order',
          groupId: operatorGroup.id,
        },
        {
          action: 'read',
          subject: 'product',
          groupId: operatorGroup.id,
        },
        {
          action: 'read',
          subject: 'customer',
          groupId: operatorGroup.id,
        },
      ],
    });

    // 🔥 usuários
    for (const user of branch.users) {
      const isAdmin = user.email?.includes('admin');

      const groupId = isAdmin ? adminGroup.id : operatorGroup.id;

      await prisma.user.update({
        where: { id: user.id },
        data: { groupId },
      });

      // =========================================
      // 🔥 OVERRIDE DE USUÁRIO (EXEMPLOS)
      // =========================================

      // limpa overrides antigos
      await prisma.permission.deleteMany({
        where: {
          userId: user.id,
        },
      });

      // 👇 exemplo 1: usuário ganha permissão extra
      if (!isAdmin) {
        await prisma.permission.create({
          data: {
            action: 'update',
            subject: 'order',
            userId: user.id,
          },
        });
      }

      // 👇 exemplo 2: negar algo específico (override negativo)
      if (user.email?.includes('bloqueado')) {
        await prisma.permission.create({
          data: {
            action: 'delete',
            subject: 'order',
            inverted: true, // ❌ nega
            userId: user.id,
          },
        });
      }
    }
  }
}

async function migratePlans() {
  console.log(' Sincronizando planos...');
  const plans = [
    {
      name: 'Degustação (Trial)',
      description: 'Experimente todos os recursos por 7 dias',
      type: 'TRIAL' as const,
      price: 0,
      billingPeriod: 'MONTHLY' as const,
      trialDays: 7,
      active: true,
      isTrial: true,
      isFeatured: false,
      displayOrder: 0,
      limits: JSON.stringify({ branches: 1, users: 2, products: 50, ordersPerMonth: 100 }),
      features: JSON.stringify(["delivery", "stock", "reports"]),
    },
    {
      name: 'Plano Básico',
      description: 'Ideal para quem está começando',
      type: 'BASIC' as const,
      price: 9900, // R$ 99,00
      billingPeriod: 'MONTHLY' as const,
      trialDays: 0,
      active: true,
      isTrial: false,
      isFeatured: false,
      displayOrder: 1,
      limits: JSON.stringify({ branches: 1, users: 5, products: 200, ordersPerMonth: 1000 }),
      features: JSON.stringify(["delivery", "stock", "reports", "coupons"]),
    },
    {
      name: 'Plano Premium',
      description: 'Recursos avançados para o seu negócio decolar',
      type: 'PREMIUM' as const,
      price: 19900, // R$ 199,00
      billingPeriod: 'MONTHLY' as const,
      trialDays: 0,
      active: true,
      isTrial: false,
      isFeatured: true,
      displayOrder: 2,
      limits: JSON.stringify({ branches: 3, users: 15, products: 1000, ordersPerMonth: 5000 }),
      features: JSON.stringify(["delivery", "stock", "reports", "coupons", "api", "analytics"]),
    },
    {
      name: 'Plano Enterprise',
      description: 'Solução completa para grandes operações',
      type: 'ENTERPRISE' as const,
      price: 49900, // R$ 499,00
      billingPeriod: 'MONTHLY' as const,
      trialDays: 0,
      active: true,
      isTrial: false,
      isFeatured: false,
      displayOrder: 3,
      limits: JSON.stringify({ branches: -1, users: -1, products: -1, ordersPerMonth: -1 }),
      features: JSON.stringify(["delivery", "stock", "reports", "coupons", "api", "analytics", "support", "custom"]),
    },
  ];

  for (const planData of plans) {
    const existingPlan = await prisma.plan.findFirst({
      where: { type: planData.type as any },
    });

    if (existingPlan) {
      const { type, ...rest } = planData;
      await prisma.plan.update({
        where: { id: existingPlan.id },
        data: rest,
      });
    } else {
      await prisma.plan.create({
        data: planData,
      });
    }
  }
  console.log(` ${plans.length} planos sincronizados.`);
}

async function runMigrations() {
  await migratePlans();
  await migrateRoles();
}

runMigrations()
  .catch((e) => {
    console.error(' Erro ao executar seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });