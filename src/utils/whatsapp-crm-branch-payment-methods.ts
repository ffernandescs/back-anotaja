import { prisma } from '../../lib/prisma';

const NONE_CONFIGURED =
  'Nenhuma forma de pagamento está configurada para pedidos pelo delivery online no momento.\nEntre em contato conosco se precisar de ajuda.';

/**
 * Formas de pagamento aceitas no cardápio/delivery online (`BranchPaymentMethod.forDelivery`).
 */
export async function resolveDeliveryPaymentMethodsFormatted(branchId: string): Promise<string> {
  const rows = await prisma.branchPaymentMethod.findMany({
    where: {
      branchId,
      forDelivery: true,
      paymentMethod: { isActive: true },
    },
    include: {
      paymentMethod: {
        select: {
          name: true,
          type: true,
        },
      },
    },
    orderBy: {
      paymentMethod: { name: 'asc' },
    },
  });

  if (rows.length === 0) return NONE_CONFIGURED;

  const names = rows
    .map((r) => `${r.paymentMethod?.name ?? ''}`.trim())
    .filter((n) => n.length > 0);

  const uniq = [...new Set(names)];

  if (uniq.length === 0) return NONE_CONFIGURED;

  const lines = ['Formas de pagamento no delivery online:'];
  for (const name of uniq) {
    lines.push(`• ${name}`);
  }

  return lines.join('\n');
}
