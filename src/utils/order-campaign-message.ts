export interface OrderCampaignMessageContext {
  menuLink: string;
  originName?: string;
  originCode?: string;
  campaignTitle?: string;
  branchName?: string;
}

export interface OrderCampaignRecipientMessage {
  name: string;
  phone: string;
}

/** Substitui placeholders {{nome}}, {{link_cardapio}}, etc. */
export function substituteOrderCampaignMessage(
  template: string,
  ctx: OrderCampaignMessageContext,
  recipient: OrderCampaignRecipientMessage,
): string {
  const phoneDigits = recipient.phone.replace(/\D/g, '');
  const map: Record<string, string> = {
    '{{nome}}': recipient.name.trim() || 'Cliente',
    '{{telefone}}': phoneDigits,
    '{{link_cardapio}}': ctx.menuLink,
    '{{link}}': ctx.menuLink,
    '{{origem}}': ctx.originName ?? '',
    '{{codigo_origem}}': ctx.originCode ?? '',
    '{{titulo}}': ctx.campaignTitle ?? '',
    '{{nome_loja}}': ctx.branchName ?? '',
  };

  let out = template;
  for (const [token, value] of Object.entries(map)) {
    out = out.replaceAll(token, value);
  }
  return out;
}

export function parseOrderCampaignRecipientsJson(
  raw: unknown,
): Array<{ customerId: string; name: string; phone: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ customerId: string; name: string; phone: string }> = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const customerId = String(r.customerId ?? '').trim();
    const phone = String(r.phone ?? '').replace(/\D/g, '');
    if (!customerId || !phone) continue;
    out.push({
      customerId,
      name: String(r.name ?? '').trim() || 'Sem nome',
      phone,
    });
  }
  return out;
}
