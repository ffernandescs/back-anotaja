/**
 * URL pública da loja (cardápio) sem path extra — apenas subdomínio + domínio base.
 * Usa FRONTEND_URL (host sem protocolo, sem barra ao fim).
 */

export function buildBranchStorefrontPublicUrl(subdomain: string | null | undefined): string {
  const domain = (process.env.FRONTEND_URL ?? '')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
  if (!subdomain?.trim() || !domain) return '';
  const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
  return `${protocol}://${subdomain.trim().toLowerCase()}.${domain}`;
}
