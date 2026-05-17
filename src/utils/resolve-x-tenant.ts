/** IDs Prisma cuid() de filial (ex.: cmp9aveie02ng3ps4f2j9giwe). */
const BRANCH_CUID_PATTERN = /^c[a-z0-9]{24}$/i;

/**
 * Interpreta o header X-Tenant: subdomínio da loja ou, se for um cuid de filial, branchId.
 * Subdomínios longos (≥20 chars) não devem ser confundidos com id.
 */
export function resolveXTenant(
  xTenant?: string,
): { subdomain?: string; branchId?: string } {
  const tenant = xTenant?.trim();
  if (!tenant) return {};

  if (BRANCH_CUID_PATTERN.test(tenant)) {
    return { branchId: tenant };
  }

  return { subdomain: tenant };
}
