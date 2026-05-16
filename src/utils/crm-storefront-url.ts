import { buildOrderChannelCampaignLink } from './order-channel-campaign';
import { buildBranchStorefrontPublicUrl } from './storefront-url';

/** Origem padrão de rastreio para links do cardápio enviados pelo CRM WhatsApp. */
export const CRM_ORDER_ORIGIN_CODE = 'wapp1';

/** URL pública do cardápio com ?origem=wapp1 para atribuição de pedidos via CRM. */
export function buildCrmStorefrontMenuUrl(subdomain: string | null | undefined): string {
  const base = buildBranchStorefrontPublicUrl(subdomain);
  if (!base) return '';
  return buildOrderChannelCampaignLink({
    menuBaseUrl: base,
    originCode: CRM_ORDER_ORIGIN_CODE,
  });
}
