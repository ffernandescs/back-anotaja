/**
 * Renomeia usuários das filiais para teste1@vaidelli.com, teste2@… (senha 123456).
 *
 *   npm run db:seed-users-teste:dev
 *   npm run db:seed-users-teste:hml
 *
 * Variáveis:
 *   SEED_USER_PASSWORD=123456   — senha após o seed
 *   SEED_USER_SLOT_MAX=4        — se definido, rotaciona só teste1…testeN (padrão: um e-mail por usuário)
 */
import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';

const DOMAIN = 'vaidelli.com';
const DEFAULT_PASSWORD = process.env.SEED_USER_PASSWORD || '123456';
const SLOT_MAX = process.env.SEED_USER_SLOT_MAX
  ? Math.max(1, parseInt(process.env.SEED_USER_SLOT_MAX, 10) || 4)
  : null;

const PROTECTED_EMAILS = new Set([
  'master@vaidelli.com',
  'owner@vaidelli.com',
]);

function testEmail(slot: number): string {
  return `teste${slot}@${DOMAIN}`;
}

async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

async function main() {
  const passwordHash = await hashPassword(DEFAULT_PASSWORD);

  const users = await prisma.user.findMany({
    where: {
      branchId: { not: null },
    },
    select: {
      id: true,
      name: true,
      email: true,
      branchId: true,
      branch: { select: { subdomain: true, branchName: true } },
    },
    orderBy: [{ branch: { subdomain: 'asc' } }, { createdAt: 'asc' }],
  });

  const targets = users.filter(
    (u) => !u.email || !PROTECTED_EMAILS.has(u.email.toLowerCase()),
  );

  if (targets.length === 0) {
    console.log('Nenhum usuário de filial para atualizar.');
    return;
  }

  console.log(
    `\n🔐 Renomeando ${targets.length} usuário(s) de filial → teste1@${DOMAIN}…`,
  );
  console.log(
    SLOT_MAX
      ? `   Modo: rotativo teste1…teste${SLOT_MAX} (máx. ${SLOT_MAX} e-mails únicos)`
      : `   Modo: sequencial teste1, teste2, … teste${targets.length}`,
  );
  console.log(`   Senha: ${DEFAULT_PASSWORD}\n`);

  // Fase 1 — libera e-mails únicos (evita conflito P2002)
  for (const user of targets) {
    await prisma.user.update({
      where: { id: user.id },
      data: { email: `temp-migrate-${user.id}@${DOMAIN}` },
    });
  }

  // Fase 2 — aplica testeN@ + senha
  let slot = 0;
  const emailToBranch: Array<{ email: string; subdomain: string; name: string }> =
    [];

  for (const user of targets) {
    slot += 1;
    const index = SLOT_MAX ? ((slot - 1) % SLOT_MAX) + 1 : slot;
    const email = testEmail(index);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        email,
        password: passwordHash,
        active: true,
      },
    });

    const subdomain = user.branch?.subdomain || user.branchId || '?';
    emailToBranch.push({
      email,
      subdomain,
      name: user.name,
    });

    if (slot <= 10 || slot % 10 === 0 || slot === targets.length) {
      console.log(`   ✓ ${email} → ${subdomain} (${user.name})`);
    }
  }

  console.log(`\n✅ ${targets.length} usuário(s) atualizados.`);
  if (SLOT_MAX) {
    console.log(
      `   ⚠️ Modo rotate4: só existem ${SLOT_MAX} logins; várias filiais compartilham o mesmo e-mail.`,
    );
  }
  console.log('\n   Primeiros mapeamentos (para k6 / login manual):');
  emailToBranch.slice(0, 8).forEach((row) => {
    console.log(`      ${row.subdomain} → ${row.email}`);
  });
}

main()
  .catch((err) => {
    console.error('❌ seed-rename-users-teste falhou:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
