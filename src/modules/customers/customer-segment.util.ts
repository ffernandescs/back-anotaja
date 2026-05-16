import { Prisma } from '@prisma/client';
import type {
  SegmentFilterField,
  SegmentFilterOperator,
} from './dto/segment-customers.dto';

export interface CustomerSegmentRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  createdAt: Date;
  totalOrders: number;
  averageTicket: number;
  lastOrderAt: Date | null;
}

export interface SegmentFilterRule {
  field: SegmentFilterField;
  operator: SegmentFilterOperator;
  value: string;
}

const BRAZIL_TZ = 'America/Sao_Paulo';

/** Data civil no fuso da loja (America/Sao_Paulo), formato yyyy-MM-dd. */
export function toBrazilDateString(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: BRAZIL_TZ });
}

export function parseSegmentDateValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

function parseNumericValue(field: SegmentFilterField, value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (field === 'average_ticket') {
    const normalized = trimmed.replace(/\./g, '').replace(',', '.');
    const reais = Number.parseFloat(normalized);
    if (Number.isNaN(reais)) return null;
    return Math.round(reais * 100);
  }
  const n = Number.parseInt(trimmed, 10);
  return Number.isNaN(n) ? null : n;
}

function getFieldValue(row: CustomerSegmentRow, field: SegmentFilterField): number | string | null {
  switch (field) {
    case 'total_orders':
      return row.totalOrders;
    case 'average_ticket':
      return row.averageTicket;
    case 'created_at':
      return toBrazilDateString(row.createdAt);
    case 'last_order_at':
      return row.lastOrderAt ? toBrazilDateString(row.lastOrderAt) : null;
    default:
      return null;
  }
}

function compareDateStrings(
  operator: SegmentFilterOperator,
  actualYmd: string | null,
  expectedYmd: string,
): boolean {
  if (!actualYmd) {
    if (operator === 'neq') return true;
    return false;
  }

  switch (operator) {
    case 'eq':
      return actualYmd === expectedYmd;
    case 'neq':
      return actualYmd !== expectedYmd;
    case 'lt':
      return actualYmd < expectedYmd;
    case 'gt':
      return actualYmd > expectedYmd;
    default:
      return false;
  }
}

function compareNumbers(
  operator: SegmentFilterOperator,
  actual: number | null,
  expected: number,
): boolean {
  if (actual === null) {
    if (operator === 'neq') return true;
    return false;
  }

  switch (operator) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'lt':
      return actual < expected;
    case 'gt':
      return actual > expected;
    default:
      return false;
  }
}

/** Regras aplicadas em memória (exclui `order_on_date`, tratado no SQL). */
export function customerMatchesSegmentRules(
  row: CustomerSegmentRow,
  rules: SegmentFilterRule[],
): boolean {
  const active = rules.filter((r) => r.value.trim() && r.field !== 'order_on_date');
  if (!active.length) return true;

  return active.every((rule) => {
    if (rule.field === 'created_at' || rule.field === 'last_order_at') {
      const expected = parseSegmentDateValue(rule.value);
      if (!expected) return true;
      const actual = getFieldValue(row, rule.field) as string | null;
      return compareDateStrings(rule.operator, actual, expected);
    }

    const expected = parseNumericValue(rule.field, rule.value);
    if (expected === null) return true;
    const actual = getFieldValue(row, rule.field) as number | null;
    return compareNumbers(rule.operator, actual, expected);
  });
}

const orderDateInBrazil = Prisma.sql`(timezone('America/Sao_Paulo', o."createdAt"))::date`;

/** Filtro SQL: cliente com pedido na data (qualquer pedido no dia, não só o último). */
export function buildOrderOnDateHaving(rules: SegmentFilterRule[]): Prisma.Sql {
  const parts: Prisma.Sql[] = [];

  for (const rule of rules) {
    if (rule.field !== 'order_on_date' || !rule.value.trim()) continue;
    const ymd = parseSegmentDateValue(rule.value);
    if (!ymd) continue;
    const target = Prisma.sql`${ymd}::date`;

    switch (rule.operator) {
      case 'eq':
        parts.push(Prisma.sql`COUNT(o.id) FILTER (WHERE ${orderDateInBrazil} = ${target}) > 0`);
        break;
      case 'neq':
        parts.push(Prisma.sql`COUNT(o.id) FILTER (WHERE ${orderDateInBrazil} = ${target}) = 0`);
        break;
      case 'gt':
        parts.push(Prisma.sql`MAX(${orderDateInBrazil}) > ${target}`);
        break;
      case 'lt':
        parts.push(Prisma.sql`MAX(${orderDateInBrazil}) < ${target}`);
        break;
      default:
        break;
    }
  }

  if (!parts.length) return Prisma.empty;
  return Prisma.sql`AND ${Prisma.join(parts, ' AND ')}`;
}
