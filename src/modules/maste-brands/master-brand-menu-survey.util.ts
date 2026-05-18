import { prisma } from '../../../lib/prisma';

/**
 * Indica se a pesquisa de cardápio está ativa para a filial,
 * conforme o Master Brand da assinatura (ou brand padrão do master).
 */
export async function isMenuSurveyEnabledForBranch(
  branchId: string,
): Promise<boolean> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { companyId: true },
  });
  if (!branch) return false;

  const subscription = await prisma.subscription.findFirst({
    where: { companyId: branch.companyId },
    orderBy: { updatedAt: 'desc' },
    select: { masterBrandId: true },
  });

  if (subscription?.masterBrandId) {
    const brand = await prisma.masterBrand.findUnique({
      where: { id: subscription.masterBrandId },
      select: { menuSurveyEnabled: true },
    });
    if (brand) return brand.menuSurveyEnabled;
  }

  const defaultBrand = await prisma.masterBrand.findFirst({
    where: { isDefault: true },
    select: { menuSurveyEnabled: true },
  });

  return defaultBrand?.menuSurveyEnabled ?? true;
}
