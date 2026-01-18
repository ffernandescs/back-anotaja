import { prisma } from '../lib/prisma';

enum PlanType {
  TRIAL = 'TRIAL', // Plano de teste (gratuito, cumprindo legislação brasileira)
  BASIC = 'BASIC', // Plano básico
  PREMIUM = 'PREMIUM', // Plano premium
  ENTERPRISE = 'ENTERPRISE', // Plano empresarial
}

enum BillingPeriod {
  MONTHLY = 'MONTHLY', // Mensal
  ANNUAL = 'ANNUAL', // Anual
}

const paymentMethods = [
  {
    id: 'cash',
    name: 'Dinheiro',
    isActive: true,
  },
  {
    id: 'credit_card',
    name: 'Cartão de Crédito',
    isActive: true,
  },
  {
    id: 'debit_card',
    name: 'Cartão de Débito',
    isActive: true,
  },
  {
    id: 'pix',
    name: 'PIX',
    isActive: true,
  },
  {
    id: 'online',
    name: 'Pagamento Online',
    isActive: true,
  },
];
async function main() {
  console.log('💳 Criando planos...');

  await prisma.plan.upsert({
    where: { id: 'trial-plan' },
    update: {},
    create: {
      id: 'trial-plan',
      name: 'Plano Teste',
      description:
        'Plano de teste gratuito por 7 dias conforme legislação brasileira',
      type: PlanType.TRIAL,
      price: 0,
      billingPeriod: BillingPeriod.MONTHLY,
      limits: JSON.stringify({
        branches: 1,
        users: 3,
        products: 50,
        ordersPerMonth: 100,
      }),
      features: JSON.stringify(['delivery', 'stock', 'reports']),
      trialDays: 7,
      active: true,
      isTrial: true,
      isFeatured: false,
      displayOrder: 0,
    },
  });

  await prisma.plan.upsert({
    where: { id: 'basic-plan' },
    update: {},
    create: {
      id: 'basic-plan',
      name: 'Plano Básico',
      description: 'Ideal para pequenas empresas',
      type: PlanType.BASIC,
      price: 99.9,
      billingPeriod: BillingPeriod.MONTHLY,
      limits: JSON.stringify({
        branches: 1,
        users: 5,
        products: 200,
        ordersPerMonth: 1000,
      }),
      features: JSON.stringify(['delivery', 'stock', 'reports', 'coupons']),
      active: true,
      isTrial: false,
      isFeatured: true,
      displayOrder: 1,
    },
  });

  await prisma.plan.upsert({
    where: { id: 'premium-plan' },
    update: {},
    create: {
      id: 'premium-plan',
      name: 'Plano Premium',
      description: 'Para empresas em crescimento',
      type: PlanType.PREMIUM,
      price: 199.9,
      billingPeriod: BillingPeriod.MONTHLY,
      limits: JSON.stringify({
        branches: 5,
        users: 20,
        products: 1000,
        ordersPerMonth: 10000,
      }),
      features: JSON.stringify([
        'delivery',
        'stock',
        'reports',
        'coupons',
        'api',
        'analytics',
      ]),
      active: true,
      isTrial: false,
      isFeatured: false,
      displayOrder: 2,
    },
  });

  await prisma.plan.upsert({
    where: { id: 'enterprise-plan' },
    update: {},
    create: {
      id: 'enterprise-plan',
      name: 'Plano Empresarial',
      description: 'Solução completa para grandes empresas',
      type: PlanType.ENTERPRISE,
      price: 499.9,
      billingPeriod: BillingPeriod.MONTHLY,
      limits: JSON.stringify({
        branches: -1,
        users: -1,
        products: -1,
        ordersPerMonth: -1,
      }),
      features: JSON.stringify([
        'delivery',
        'stock',
        'reports',
        'coupons',
        'api',
        'analytics',
        'support',
        'custom',
      ]),
      active: true,
      isTrial: false,
      isFeatured: false,
      displayOrder: 3,
    },
  });

  console.log(`✅ ${await prisma.plan.count()} planos criados/atualizados`);

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
}

main()
  .catch((e) => {
    console.error('❌ Erro ao executar seed de planos:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
