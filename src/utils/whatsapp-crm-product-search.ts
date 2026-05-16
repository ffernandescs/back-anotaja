import { prisma } from '../../lib/prisma';
import { formatCurrency } from './formatCurrency';

export interface CrmProductSearchHit {
  id: string;
  name: string;
  description: string | null;
  price: number;
  effectivePrice: number;
  categoryName: string | null;
}

const STOPWORDS = new Set([
  'a',
  'o',
  'os',
  'as',
  'um',
  'uma',
  'de',
  'da',
  'do',
  'dos',
  'das',
  'e',
  'em',
  'no',
  'na',
  'nos',
  'nas',
  'por',
  'para',
  'com',
  'sem',
  'que',
  'qual',
  'quais',
  'quanto',
  'quanta',
  'quantos',
  'quantas',
  'custa',
  'custam',
  'custo',
  'valor',
  'preco',
  'preço',
  'tem',
  'têm',
  'tenho',
  'voces',
  'vocês',
  'vcs',
  'vc',
  'voce',
  'você',
  'vende',
  'vendem',
  'cardapio',
  'cardápio',
  'menu',
  'produto',
  'produtos',
  'item',
  'itens',
  'sobre',
  'informacao',
  'informação',
  'informacoes',
  'informações',
  'saber',
  'quero',
  'gostaria',
  'pedir',
  'fazer',
  'pedido',
  'loja',
  'restaurante',
  'delivery',
  'oi',
  'ola',
  'olá',
  'bom',
  'dia',
  'tarde',
  'noite',
  'por favor',
  'pf',
  'pfv',
  'ai',
  'aí',
  'algum',
  'alguma',
  'alguns',
  'algumas',
  'esse',
  'essa',
  'isso',
  'disponivel',
  'disponível',
  'ainda',
  'hoje',
]);

function normalizeSearchText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Termos úteis para busca (sem stopwords curtas). */
export function tokenizeProductSearchQuery(raw: string): string[] {
  const norm = normalizeSearchText(raw);
  if (!norm) return [];

  const parts = norm.split(' ').filter((w) => w.length >= 2 && !STOPWORDS.has(w));
  const uniq: string[] = [];
  for (const p of parts) {
    if (!uniq.includes(p)) uniq.push(p);
  }
  return uniq.slice(0, 8);
}

/** Preço vigente considerando regras de promoção (data/dia da semana). */
export function getCrmEffectiveProductPrice(product: {
  price: number;
  hasPromotion: boolean;
  promotionalPrice: number | null;
  promotionalType: string | null;
  promotionalPeriodType: string | null;
  promotionalStartDate: Date | null;
  promotionalEndDate: Date | null;
  promotionalDays: string | null;
}): number {
  if (!product.hasPromotion || product.promotionalPrice == null) return product.price;

  const now = new Date();

  if (product.promotionalPeriodType === 'DATE_RANGE') {
    if (product.promotionalStartDate && product.promotionalEndDate) {
      const start = new Date(product.promotionalStartDate);
      const end = new Date(product.promotionalEndDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      if (now < start || now > end) return product.price;
    }
  }

  if (product.promotionalPeriodType === 'DAYS_OF_WEEK' && product.promotionalDays) {
    try {
      const dayNames = [
        'sunday',
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
      ];
      const todayKey = dayNames[now.getDay()];
      const days: string[] = JSON.parse(product.promotionalDays);
      if (Array.isArray(days) && days.length > 0 && !days.includes(todayKey)) {
        return product.price;
      }
    } catch {
      return product.price;
    }
  }

  const promoPrice = product.promotionalPrice;
  if (product.promotionalType === 'FIXED') return promoPrice;
  if (product.promotionalType === 'PERCENTAGE') {
    return Math.round(product.price - (product.price * promoPrice) / 100);
  }

  return product.price;
}

function scoreProduct(
  p: { name: string; description: string | null; tags: string | null },
  terms: string[],
  fullNorm: string,
): number {
  const name = normalizeSearchText(p.name);
  const desc = normalizeSearchText(p.description ?? '');
  const tags = normalizeSearchText(p.tags ?? '');

  let score = 0;
  if (fullNorm.length >= 3 && name.includes(fullNorm)) score += 12;
  for (const t of terms) {
    if (name.includes(t)) score += 6;
    else if (desc.includes(t)) score += 3;
    else if (tags.includes(t)) score += 2;
  }
  return score;
}

function truncateDesc(text: string | null, max = 72): string {
  const t = `${text ?? ''}`.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function formatPriceLabel(price: number, effectivePrice: number): string {
  if (effectivePrice < price) {
    return `de ${formatCurrency(price)} por ${formatCurrency(effectivePrice)}`;
  }
  return formatCurrency(effectivePrice);
}

/**
 * Busca produtos ativos da filial por termos (nome, descrição, tags).
 */
export async function searchBranchProductsForCrm(
  branchId: string,
  rawQuery: string,
  limit = 6,
): Promise<CrmProductSearchHit[]> {
  const fullNorm = normalizeSearchText(rawQuery);
  const terms = tokenizeProductSearchQuery(rawQuery);
  if (terms.length === 0 && fullNorm.length < 2) return [];

  const searchTerms = terms.length > 0 ? terms : [fullNorm];

  const rows = await prisma.product.findMany({
    where: {
      branchId,
      active: true,
      OR: searchTerms.flatMap((term) => [
        { name: { contains: term, mode: 'insensitive' as const } },
        { description: { contains: term, mode: 'insensitive' as const } },
        { tags: { contains: term, mode: 'insensitive' as const } },
      ]),
    },
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      tags: true,
      hasPromotion: true,
      promotionalPrice: true,
      promotionalType: true,
      promotionalPeriodType: true,
      promotionalStartDate: true,
      promotionalEndDate: true,
      promotionalDays: true,
      category: { select: { name: true } },
    },
    take: 48,
  });

  const scored = rows
    .map((row) => {
      const effectivePrice = getCrmEffectiveProductPrice(row);
      return {
        row,
        effectivePrice,
        score: scoreProduct(row, searchTerms, fullNorm),
      };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.row.name.localeCompare(b.row.name, 'pt-BR'));

  return scored.slice(0, limit).map(({ row, effectivePrice }) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    effectivePrice,
    categoryName: row.category?.name ?? null,
  }));
}

/** Bloco WhatsApp para `{{lista_produtos}}`. */
export function formatCrmProductListBlock(hits: CrmProductSearchHit[], searchLabel?: string): string {
  if (hits.length === 0) {
    const hint = searchLabel?.trim()
      ? `Não encontramos itens no cardápio para “${searchLabel.trim()}” no momento.`
      : 'Não encontramos itens no cardápio com esse termo no momento.';
    return `${hint}\nConfira todas as opções pelo link abaixo.`;
  }

  const lines: string[] = ['Encontrei estes itens relacionados:'];
  for (const p of hits) {
    const priceStr = formatPriceLabel(p.price, p.effectivePrice);
    const cat = p.categoryName ? ` (${p.categoryName})` : '';
    lines.push(`\n• *${p.name}*${cat} — ${priceStr}`);
    const desc = truncateDesc(p.description);
    if (desc) lines.push(`  ${desc}`);
  }
  return lines.join('');
}
