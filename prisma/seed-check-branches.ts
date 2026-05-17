/**
 * Lista filiais do seed que ainda não estão prontas (subdomínio / produtos / pagamento).
 *
 *   npm run db:seed-check:hml
 */
import { prisma } from '../lib/prisma';
import { EXPECTED_SEED_SUBDOMAINS } from './seed-expected-subdomains';

async function main() {
  const branches = await prisma.branch.findMany({
    where: { subdomain: { in: [...EXPECTED_SEED_SUBDOMAINS] } },
    select: {
      subdomain: true,
      branchName: true,
      _count: { select: { products: true } },
      paymentMethods: { select: { id: true } },
      generalConfig: { select: { id: true } },
    },
  });

  const bySub = new Map(branches.map((b) => [b.subdomain, b]));

  const missing: string[] = [];
  const incomplete: Array<{
    subdomain: string;
    branchName: string;
    products: number;
    payments: number;
    hasConfig: boolean;
  }> = [];

  for (const subdomain of EXPECTED_SEED_SUBDOMAINS) {
    const branch = bySub.get(subdomain);
    if (!branch) {
      missing.push(subdomain);
      continue;
    }
    const payments = branch.paymentMethods.length;
    const hasConfig = Boolean(branch.generalConfig);
    const products = branch._count.products;
    if (products < 3 || payments < 1 || !hasConfig) {
      incomplete.push({
        subdomain,
        branchName: branch.branchName,
        products,
        payments,
        hasConfig,
      });
    }
  }

  console.log(`\n📊 Seed check — esperadas: ${EXPECTED_SEED_SUBDOMAINS.length} filiais\n`);
  console.log(`✅ Prontas: ${EXPECTED_SEED_SUBDOMAINS.length - missing.length - incomplete.length}`);
  console.log(`❌ Sem filial no banco: ${missing.length}`);
  console.log(`⚠️  Filial incompleta: ${incomplete.length}\n`);

  if (missing.length) {
    console.log('Subdomínios ausentes:');
    missing.forEach((s) => console.log(`  - ${s}`));
    console.log('');
  }

  if (incomplete.length) {
    console.log('Filiais incompletas (falta produto/pagamento/config):');
    incomplete.forEach((b) => {
      console.log(
        `  - ${b.subdomain} (${b.branchName}) | produtos=${b.products} pagamentos=${b.payments} config=${b.hasConfig}`,
      );
    });
    console.log('');
  }

  if (missing.length === 0 && incomplete.length === 0) {
    console.log('🎉 Todas as 50 filiais estão prontas para os testes k6.\n');
  } else {
    console.log('👉 Rode novamente: npm run db:seed:hml\n');
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
