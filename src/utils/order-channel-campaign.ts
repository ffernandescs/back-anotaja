/** Canais de pedido (interno; link público usa só ?origem=). */
export const ORDER_CAMPAIGN_CHANNEL_CODES = ['DIGITAL_MENU_DELIVERY'] as const;

export type OrderCampaignChannelCode = (typeof ORDER_CAMPAIGN_CHANNEL_CODES)[number];

export const ORDER_ORIGIN_CODE_MIN = 5;
export const ORDER_ORIGIN_CODE_MAX = 12;

export function isValidOrderCampaignChannelCode(code: string): code is OrderCampaignChannelCode {
  return (ORDER_CAMPAIGN_CHANNEL_CODES as readonly string[]).includes(code);
}

/** Mín. 5 caracteres, só a-z/0-9, com letras e números. */
export function isValidOrderOriginCode(code: string): boolean {
  const c = code.trim().toLowerCase();
  if (c.length < ORDER_ORIGIN_CODE_MIN || c.length > ORDER_ORIGIN_CODE_MAX) return false;
  if (!/^[a-z0-9]+$/.test(c)) return false;
  return /[a-z]/.test(c) && /[0-9]/.test(c);
}

function randomDigit(): string {
  return String(Math.floor(Math.random() * 10));
}

function randomLetter(): string {
  return String.fromCharCode(97 + Math.floor(Math.random() * 26));
}

function ensureLetterAndDigit(code: string): string {
  let result = code;
  if (!/[a-z]/.test(result)) result += randomLetter();
  if (!/[0-9]/.test(result)) result += randomDigit();
  return result.slice(0, ORDER_ORIGIN_CODE_MAX);
}

function padWithMixedChars(code: string, minLen: number): string {
  let result = ensureLetterAndDigit(code.replace(/[^a-z0-9]/g, '') || 'o');
  let toggleDigit = true;
  while (result.length < minLen) {
    result += toggleDigit ? randomDigit() : randomLetter();
    toggleDigit = !toggleDigit;
  }
  return ensureLetterAndDigit(result.slice(0, ORDER_ORIGIN_CODE_MAX));
}

/** Gera código (mín. 5 chars) misturando letras e números; garante unicidade em `existing`. */
export function suggestOrderOriginCode(name: string, existing: string[] = []): string {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  const words = normalized.split(/\s+/).filter(Boolean);
  const letterBase = (
    words.length >= 2
      ? words
          .slice(0, 3)
          .map((w) => w[0])
          .join('')
      : (words[0] ?? 'or').slice(0, 3)
  ).replace(/[^a-z]/g, '') || 'or';

  const digitPart = Array.from({ length: 3 }, randomDigit).join('');
  let base = padWithMixedChars(`${letterBase}${digitPart}`, ORDER_ORIGIN_CODE_MIN);

  const taken = new Set(existing.map((c) => c.toLowerCase()));
  let code = base;
  let n = 2;
  while (taken.has(code)) {
    const suffix = String(n);
    const trimmed = letterBase.slice(0, Math.max(2, ORDER_ORIGIN_CODE_MAX - suffix.length));
    code = padWithMixedChars(`${trimmed}${suffix}${randomDigit()}`, ORDER_ORIGIN_CODE_MIN);
    n += 1;
  }
  return code;
}

export interface BuildOrderChannelCampaignLinkParams {
  menuBaseUrl: string;
  originCode: string;
}

/** URL do cardápio: apenas ?origem={codigo} */
export function buildOrderChannelCampaignLink(params: BuildOrderChannelCampaignLinkParams): string {
  const base = (params.menuBaseUrl ?? '').trim();
  const code = (params.originCode ?? '').trim().toLowerCase();
  if (!base || !code) return '';

  const url = new URL(base.includes('://') ? base : `https://${base}`);
  url.searchParams.set('origem', code);
  return url.toString();
}
