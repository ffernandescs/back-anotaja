/** IDs Prisma cuid() de filial (ex.: cmp9aveie02ng3ps4f2j9giwe). */
const BRANCH_CUID_PATTERN = /^c[a-z0-9]{24}$/i;

/**
 * Slugs de loja longos podem coincidir com o formato cuid (ex.: caldosdoneguinhoboaviagem).
 * Heurística: palavras compostas têm mais vogais que ids aleatórios.
 */
function looksLikeStoreSubdomain(value: string): boolean {
  if (!/^[a-z0-9-]+$/i.test(value)) {
    return false;
  }
  const vowels = (value.match(/[aeiou]/gi) || []).length;
  return vowels / value.length >= 0.28;
}

/**
 * Interpreta o header X-Tenant: subdomínio da loja ou, se for um cuid de filial, branchId.
 */
export function resolveXTenant(
  xTenant?: string,
): { subdomain?: string; branchId?: string } {
  const tenant = xTenant?.trim();
  if (!tenant) return {};

  if (BRANCH_CUID_PATTERN.test(tenant) && !looksLikeStoreSubdomain(tenant)) {
    return { branchId: tenant };
  }

  return { subdomain: tenant };
}
