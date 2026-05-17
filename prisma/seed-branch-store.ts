/**
 * Dados operacionais da loja online por filial (mesmo pacote das 18 filiais base).
 * Produtos/complementos continuam em createCategoriesProductsAndComplements (seed.ts).
 */
import { PaymentMethodType } from '@prisma/client';
import { prisma } from '../lib/prisma';

const WEEK_DAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

const DEFAULT_STORE_PAYMENT_TYPES: PaymentMethodType[] = [
  PaymentMethodType.CASH,
  PaymentMethodType.PIX,
  PaymentMethodType.CREDIT,
  PaymentMethodType.DEBIT,
];

export async function seedBranchPaymentMethods(branchId: string): Promise<number> {
  const paymentMethods = await prisma.paymentMethod.findMany({
    where: {
      isActive: true,
      type: { in: DEFAULT_STORE_PAYMENT_TYPES },
    },
  });

  if (paymentMethods.length === 0) {
    console.warn(
      `⚠️ Nenhum PaymentMethod global encontrado para a filial ${branchId}. Rode seed:master antes do seed principal.`,
    );
    return 0;
  }

  let linked = 0;
  for (const method of paymentMethods) {
    await prisma.branchPaymentMethod.upsert({
      where: {
        branchId_paymentMethodId: {
          branchId,
          paymentMethodId: method.id,
        },
      },
      update: {
        forDelivery: true,
        forDineIn: true,
      },
      create: {
        branchId,
        paymentMethodId: method.id,
        forDelivery: true,
        forDineIn: true,
      },
    });
    linked++;
  }

  return linked;
}

export async function seedBranchGeneralConfig(branchId: string): Promise<void> {
  await prisma.generalConfig.upsert({
    where: { branchId },
    update: {
      enableDelivery: true,
      enableDineIn: true,
      enablePickup: true,
      showCategoriesScreen: true,
      customerLoginWithPassword: false,
      pixMode: 'manual',
    },
    create: {
      branchId,
      enableDelivery: true,
      enableDineIn: true,
      enablePickup: true,
      showCategoriesScreen: true,
      customerLoginWithPassword: false,
      pixMode: 'manual',
    },
  });
}

/** Horário amplo para testes (evita "loja fechada" em carga). */
export async function seedBranchOpeningHours(branchId: string): Promise<void> {
  for (const day of WEEK_DAYS) {
    const existing = await prisma.branchSchedule.findFirst({
      where: { branchId, day, date: null },
    });

    const payload = {
      open: '00:00',
      close: '23:59',
      closed: false,
    };

    if (existing) {
      await prisma.branchSchedule.update({
        where: { id: existing.id },
        data: payload,
      });
    } else {
      await prisma.branchSchedule.create({
        data: {
          branchId,
          day,
          ...payload,
        },
      });
    }
  }
}

/**
 * Configura filial para cardápio/checkout (pagamentos, config, horário).
 * Chamar após createCategoriesProductsAndComplements no seed principal.
 */
export async function seedBranchStoreInfrastructure(
  branchId: string,
  branchLabel: string,
): Promise<void> {
  const payments = await seedBranchPaymentMethods(branchId);
  await seedBranchGeneralConfig(branchId);
  await seedBranchOpeningHours(branchId);
  console.log(
    `  🛒 Loja online pronta (${branchLabel}): ${payments} forma(s) de pagamento, generalConfig e horários`,
  );
}
