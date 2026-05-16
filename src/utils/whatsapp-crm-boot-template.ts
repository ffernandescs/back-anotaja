/**
 * Tokens do editor CRM ChatBot (`{{nome_cliente}}`, etc.) — mesmo contrato do front `substitute-chatbot-template`.
 */

export interface CrmBootTemplateContext {
  customerName?: string | null;
  ordersLink?: string | null;
  /** Default: servidor (fusos da filial podem refinar depois). */
  now?: Date;
}

export function greetingForHour(when: Date): 'Bom dia' | 'Boa tarde' | 'Boa noite' {
  const h = when.getHours();
  if (h >= 5 && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function substituteCrmBootTokens(text: string, ctx: CrmBootTemplateContext = {}): string {
  const when = ctx.now ?? new Date();
  const nome = ((ctx.customerName ?? 'Cliente').trim() || 'Cliente').trim();
  const link = ((ctx.ordersLink ?? '') + '').trim() || 'https://suapedida.vaidelli.shop/menu';

  return text
    .replaceAll(/\{\{\s*nome_cliente\s*\}\}/g, nome)
    .replaceAll(/\{\{\s*link_pedidos\s*\}\}/g, link)
    .replaceAll(/\{\{\s*saudacao_horario\s*\}\}/g, greetingForHour(when));
}
