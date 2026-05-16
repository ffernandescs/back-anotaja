/**
 * Tokens do editor CRM ChatBot (`{{nome_cliente}}`, etc.) — mesmo contrato do front `substitute-chatbot-template`.
 */

export interface CrmBootTemplateContext {
  customerName?: string | null;
  ordersLink?: string | null;
  /** Recomenda-se `getNowInSaoPaulo()` no disparo Brasil; default: relógio do processo. */
  now?: Date;
  /** BranchSchedule montado como texto (`{{horarios_filial}}`). */
  branchHoursFormatted?: string | null;
  /** Estado aberto/fechado atual da filial (`{{status_horario_filial}}`). */
  branchHoursStatusLine?: string | null;
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
  const horarios = ((ctx.branchHoursFormatted ?? '') + '').trim();
  const statusHorario = ((ctx.branchHoursStatusLine ?? '') + '').trim();

  return text
    .replaceAll(/\{\{\s*nome_cliente\s*\}\}/g, nome)
    .replaceAll(/\{\{\s*link_pedidos\s*\}\}/g, link)
    .replaceAll(/\{\{\s*saudacao_horario\s*\}\}/g, greetingForHour(when))
    .replaceAll(/\{\{\s*horarios_filial\s*\}\}/g, horarios || '—')
    .replaceAll(/\{\{\s*status_horario_filial\s*\}\}/g, statusHorario || '—');
}
