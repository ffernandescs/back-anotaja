import { prisma } from '../lib/prisma';
enum PlanType {
  TRIAL = 'TRIAL',
  BASIC = 'BASIC',
  PREMIUM = 'PREMIUM',
  ENTERPRISE = 'ENTERPRISE',
}

enum BillingPeriod {
  MONTHLY = 'MONTHLY',
  SEMESTRAL = 'SEMESTRAL',
  ANNUAL = 'ANNUAL',
}

// Desconto por período (%)
enum BillingPeriodDiscount {
  MONTHLY = 0, // sem desconto
  SEMESTRAL = 10, // 10% de desconto
  ANNUAL = 20, // 20% de desconto
}

const paymentMethods = [
  { id: 'cash', name: 'Dinheiro', isActive: true },
  { id: 'credit_card', name: 'Cartão de Crédito', isActive: true },
  { id: 'debit_card', name: 'Cartão de Débito', isActive: true },
  { id: 'pix', name: 'PIX', isActive: true },
  { id: 'online', name: 'Pagamento Online', isActive: true },
];

// Preços base mensais (valores inteiros)
const basePrices = {
  BASIC: 2990,
  PREMIUM: 5990,
  ENTERPRISE: 9990,
};

// Função para calcular preço com desconto
function calculatePrice(basePrice: number, months: number) {
  const total = basePrice * months; // valor sem desconto
  return total;
}
const plans = [
  // Plano Trial
  {
    id: 'trial-plan',
    name: 'Plano Teste',
    description:
      'Plano de teste gratuito por 7 dias conforme legislação brasileira',
    type: PlanType.TRIAL,
    price: calculatePrice(basePrices.BASIC, 0), // ou 0 se não cobrar
    discount: 0,
    billingPeriod: BillingPeriod.MONTHLY,
    limits: { branches: 1, users: 3, products: 50, ordersPerMonth: 100 },
    features: ['delivery', 'stock', 'reports'],
    trialDays: 7,
    active: true,
    isTrial: true,
    isFeatured: false,
    displayOrder: 0,
  },

  // BASIC
  {
    id: 'basic-plan-monthly',
    name: 'Plano Básico Mensal',
    description: 'Ideal para pequenas empresas, mensal',
    type: PlanType.BASIC,
    price: calculatePrice(basePrices.BASIC, 1),
    discount: BillingPeriodDiscount.MONTHLY,
    billingPeriod: BillingPeriod.MONTHLY,
    limits: { branches: 1, users: 5, products: 200, ordersPerMonth: 1000 },
    features: ['delivery', 'stock', 'reports', 'coupons'],
    active: true,
    isTrial: false,
    isFeatured: true,
    displayOrder: 1,
  },
  {
    id: 'basic-plan-semestral',
    name: 'Plano Básico Semestral',
    description: 'Ideal para pequenas empresas, semestral com desconto',
    type: PlanType.BASIC,
    price: calculatePrice(basePrices.BASIC, 6),
    discount: BillingPeriodDiscount.SEMESTRAL,
    billingPeriod: BillingPeriod.SEMESTRAL,
    limits: { branches: 1, users: 5, products: 200, ordersPerMonth: 1000 },
    features: ['delivery', 'stock', 'reports', 'coupons'],
    active: true,
    isTrial: false,
    isFeatured: true,
    displayOrder: 2,
  },
  {
    id: 'basic-plan-annual',
    name: 'Plano Básico Anual',
    description: 'Ideal para pequenas empresas, anual com desconto',
    type: PlanType.BASIC,
    price: calculatePrice(basePrices.BASIC, 12),
    discount: BillingPeriodDiscount.ANNUAL,
    billingPeriod: BillingPeriod.ANNUAL,
    limits: { branches: 1, users: 5, products: 200, ordersPerMonth: 1000 },
    features: ['delivery', 'stock', 'reports', 'coupons'],
    active: true,
    isTrial: false,
    isFeatured: true,
    displayOrder: 3,
  },

  // PREMIUM
  {
    id: 'premium-plan-monthly',
    name: 'Plano Premium Mensal',
    description: 'Para empresas em crescimento, mensal',
    type: PlanType.PREMIUM,
    price: calculatePrice(basePrices.PREMIUM, 1),
    discount: BillingPeriodDiscount.MONTHLY,
    billingPeriod: BillingPeriod.MONTHLY,
    limits: { branches: 5, users: 20, products: 1000, ordersPerMonth: 10000 },
    features: ['delivery', 'stock', 'reports', 'coupons', 'api', 'analytics'],
    active: true,
    isTrial: false,
    isFeatured: false,
    displayOrder: 4,
  },
  {
    id: 'premium-plan-semestral',
    name: 'Plano Premium Semestral',
    description: 'Para empresas em crescimento, semestral com desconto',
    type: PlanType.PREMIUM,
    price: calculatePrice(basePrices.PREMIUM, 6),
    discount: BillingPeriodDiscount.SEMESTRAL,
    billingPeriod: BillingPeriod.SEMESTRAL,
    limits: { branches: 5, users: 20, products: 1000, ordersPerMonth: 10000 },
    features: ['delivery', 'stock', 'reports', 'coupons', 'api', 'analytics'],
    active: true,
    isTrial: false,
    isFeatured: false,
    displayOrder: 5,
  },
  {
    id: 'premium-plan-annual',
    name: 'Plano Premium Anual',
    description: 'Para empresas em crescimento, anual com desconto',
    type: PlanType.PREMIUM,
    price: calculatePrice(basePrices.PREMIUM, 12),
    discount: BillingPeriodDiscount.ANNUAL,
    billingPeriod: BillingPeriod.ANNUAL,
    limits: { branches: 5, users: 20, products: 1000, ordersPerMonth: 10000 },
    features: ['delivery', 'stock', 'reports', 'coupons', 'api', 'analytics'],
    active: true,
    isTrial: false,
    isFeatured: false,
    displayOrder: 6,
  },

  // ENTERPRISE
  {
    id: 'enterprise-plan-monthly',
    name: 'Plano Empresarial Mensal',
    description: 'Solução completa para grandes empresas, mensal',
    type: PlanType.ENTERPRISE,
    price: calculatePrice(basePrices.ENTERPRISE, 1),
    discount: BillingPeriodDiscount.MONTHLY,
    billingPeriod: BillingPeriod.MONTHLY,
    limits: { branches: -1, users: -1, products: -1, ordersPerMonth: -1 },
    features: [
      'delivery',
      'stock',
      'reports',
      'coupons',
      'api',
      'analytics',
      'support',
      'custom',
    ],
    active: true,
    isTrial: false,
    isFeatured: false,
    displayOrder: 7,
  },
  {
    id: 'enterprise-plan-semestral',
    name: 'Plano Empresarial Semestral',
    description:
      'Solução completa para grandes empresas, semestral com desconto',
    type: PlanType.ENTERPRISE,
    price: calculatePrice(basePrices.ENTERPRISE, 6),
    discount: BillingPeriodDiscount.SEMESTRAL,
    billingPeriod: BillingPeriod.SEMESTRAL,
    limits: { branches: -1, users: -1, products: -1, ordersPerMonth: -1 },
    features: [
      'delivery',
      'stock',
      'reports',
      'coupons',
      'api',
      'analytics',
      'support',
      'custom',
    ],
    active: true,
    isTrial: false,
    isFeatured: false,
    displayOrder: 8,
  },
  {
    id: 'enterprise-plan-annual',
    name: 'Plano Empresarial Anual',
    description: 'Solução completa para grandes empresas, anual com desconto',
    type: PlanType.ENTERPRISE,
    price: calculatePrice(basePrices.ENTERPRISE, 12),
    discount: BillingPeriodDiscount.ANNUAL,
    billingPeriod: BillingPeriod.ANNUAL,
    limits: { branches: -1, users: -1, products: -1, ordersPerMonth: -1 },
    features: [
      'delivery',
      'stock',
      'reports',
      'coupons',
      'api',
      'analytics',
      'support',
      'custom',
    ],
    active: true,
    isTrial: false,
    isFeatured: false,
    displayOrder: 9,
  },
];

async function main() {
  console.log('💳 Criando planos...');

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { id: plan.id },
      update: {},
      create: {
        ...plan,
        limits: JSON.stringify(plan.limits),
        features: JSON.stringify(plan.features),
      },
    });
  }
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
