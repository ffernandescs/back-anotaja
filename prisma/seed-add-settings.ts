/**
 * Migration: adiciona permissões de `settings_tables` a todos os grupos
 * que já possuem permissões de `settings_service_fee`.
 *
 * Execute com:
 *   npx ts-node -r tsconfig-paths/register prisma/seed-add-settings-tables.ts
 */

import { prisma } from '../lib/prisma';

async function main() {
  console.log('🔧 Adicionando permissões de settings_tables...');

  // 1. Garante que a Feature existe no banco
  const feature = await prisma.feature.upsert({
    where: { key: 'settings_tables' },
    update: {
      name: 'Mesas e Comandas',
      href: '/admin/administration/settings/tables',
      active: true,
      defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
    },
    create: {
      key: 'settings_tables',
      name: 'Mesas e Comandas',
      href: '/admin/administration/settings/tables',
      active: true,
      defaultActions: JSON.stringify(['create', 'read', 'update', 'delete']),
    },
  });
  console.log(`✅ Feature upsertada: ${feature.key} (id: ${feature.id})`);

  // 2. Encontra todos os grupos que têm permissão para settings_service_fee
  //    (proxy para "grupos que devem ter acesso a settings_tables")
  const groupsWithServiceFee = await prisma.permission.findMany({
    where: { subject: 'settings_service_fee' },
    select: { groupId: true },
    distinct: ['groupId'],
  });

  const groupIds = groupsWithServiceFee
    .map((p) => p.groupId)
    .filter((id): id is string => id !== null);

  console.log(`📋 Grupos elegíveis encontrados: ${groupIds.length}`);

  const actions = ['create', 'read', 'update', 'delete'] as const;
  let added = 0;
  let skipped = 0;

  for (const groupId of groupIds) {
    for (const action of actions) {
      const existing = await prisma.permission.findFirst({
        where: { groupId, action: action as any, subject: 'settings_tables' },
      });

      if (!existing) {
        await prisma.permission.create({
          data: {
            action: action as any,
            subject: 'settings_tables',
            inverted: false,
            groupId,
            source: 'CUSTOM',
          },
        });
        added++;
      } else {
        skipped++;
      }
    }
  }

  console.log(`✅ Permissões adicionadas: ${added}`);
  console.log(`⏭️  Permissões já existentes (ignoradas): ${skipped}`);
  console.log('🎉 Migração concluída.');
}

main()
  .catch((e) => {
    console.error('❌ Erro na migração:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
