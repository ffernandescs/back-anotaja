import { prisma } from '../../lib/prisma';
import { formatCurrency } from './formatCurrency';
import { getCrmEffectiveProductPrice } from './whatsapp-crm-product-search';

const MAX_PROMOTIONS_IN_MESSAGE = 15;

const NONE_ACTIVE =
  'No momento não temos produtos em promoção ativa no cardápio.\nConfira o cardápio completo pelo link abaixo.';

type PromoRow = {
  name: string;
  price: number;
  effectivePrice: number;
  categoryName: string | null;
};

function formatPromoPriceLine(price: number, effectivePrice: number): string {
  if (effectivePrice < price) {
    return `de ${formatCurrency(price)} por ${formatCurrency(effectivePrice)}`;
  }
  return formatCurrency(effectivePrice);
}

function formatPromotionsBlock(rows: PromoRow[]): string {
  if (rows.length === 0) return NONE_ACTIVE;

  const lines = ['Promoções ativas no cardápio:'];
  for (const p of rows) {
    const priceStr = formatPromoPriceLine(p.price, p.effectivePrice);
    const cat = p.categoryName ? ` (${p.categoryName})` : '';
    lines.push(`\n• *${p.name}*${cat} — ${priceStr}`);
  }

  if (rows.length >= MAX_PROMOTIONS_IN_MESSAGE) {
    lines.push('\n_(Lista limitada; veja todas no cardápio online.)_');
  }

  return lines.join('');
}

/**
 * Produtos da filial com promoção **vigente agora** (hasPromotion + regras de período/dia).
 */
export async function resolveBranchProductPromotionsFormatted(branchId: string): Promise<string> {
  const rows = await prisma.product.findMany({
    where: {
      branchId,
      active: true,
      hasPromotion: true,
      promotionalPrice: { not: null },
    },
    select: {
      name: true,
      price: true,
      hasPromotion: true,
      promotionalPrice: true,
      promotionalType: true,
      promotionalPeriodType: true,
      promotionalStartDate: true,
      promotionalEndDate: true,
      promotionalDays: true,
      featured: true,
      category: { select: { name: true } },
    },
    orderBy: [{ featured: 'desc' }, { name: 'asc' }],
    take: 80,
  });

  const active: PromoRow[] = [];

  for (const row of rows) {
    const effectivePrice = getCrmEffectiveProductPrice(row);
    if (effectivePrice >= row.price) continue;

    active.push({
      name: row.name,
      price: row.price,
      effectivePrice,
      categoryName: row.category?.name ?? null,
    });
  }

  return formatPromotionsBlock(active.slice(0, MAX_PROMOTIONS_IN_MESSAGE));
}
