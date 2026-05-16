/**
 * Migra order_origins de escopo por filial para catálogo global.
 * Execute uma vez antes de `prisma db push` após atualizar o schema:
 *
 *   npx ts-node scripts/migrate-order-origins-global.ts
 *   npm run prisma:db:push:dev
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Migrando origens de pedido para catálogo global...');

  const all = await prisma.$queryRaw<
    { id: string; branchId: string; name: string; code: string; createdAt: Date }[]
  >`SELECT id, "branchId", name, code, "createdAt" FROM order_origins ORDER BY code, "createdAt" ASC`;

  if (!all.length) {
    console.log('ℹ️  Nenhuma origem encontrada.');
    return;
  }

  const canonicalByCode = new Map<string, string>();
  for (const row of all) {
    const code = row.code.toLowerCase();
    if (!canonicalByCode.has(code)) {
      canonicalByCode.set(code, row.id);
    }
  }

  for (const row of all) {
    const code = row.code.toLowerCase();
    const canonicalId = canonicalByCode.get(code)!;
    if (canonicalId === row.id) continue;

    await prisma.orderChannelCampaign.updateMany({
      where: { orderOriginId: row.id },
      data: { orderOriginId: canonicalId, orderChannelCode: row.code },
    });

    await prisma.order.updateMany({
      where: { orderOriginId: row.id },
      data: { orderOriginId: canonicalId },
    });

    await prisma.orderOrigin.delete({ where: { id: row.id } });
    console.log(`  ↳ Unificado ${row.code}: ${row.id} → ${canonicalId}`);
  }

  console.log(`✅ ${canonicalByCode.size} origem(ns) canônica(s) mantida(s).`);
  console.log('➡️  Agora execute prisma db push para remover a coluna branchId.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
