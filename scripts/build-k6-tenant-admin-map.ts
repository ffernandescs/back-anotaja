/**
 * Gera k6-tests/config/tenant-admin-map.js a partir do banco (admin por filial).
 *
 *   npm run build:k6-admin-map:dev
 *   npm run build:k6-admin-map:hml          (só dentro da VPS / rede Docker — host postgres)
 *   npm run build:k6-admin-map:hml:local     (do seu Mac — usa .env.dev → IP externo da HML)
 */
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';

const ROOT = path.resolve(__dirname, '../..');
const TENANTS_PATH = path.join(ROOT, 'k6-tests/config/tenants-50.js');
const OUT_PATH = path.join(ROOT, 'k6-tests/config/tenant-admin-map.js');

function parseSubdomains(): string[] {
  const text = fs.readFileSync(TENANTS_PATH, 'utf8');
  return [...text.matchAll(/subdomain:\s*'([^']+)'/g)].map((m) => m[1]);
}

function fallbackEmail(index: number): string {
  const slot = (index % 4) + 1;
  return `teste${slot}@vaidelli.com`;
}

async function main() {
  const subdomains = parseSubdomains();
  const emails: Record<string, string> = {};

  subdomains.forEach((subdomain, index) => {
    emails[subdomain] = fallbackEmail(index);
  });

  let fromDb = 0;
  for (const subdomain of subdomains) {
    const branch = await prisma.branch.findFirst({
      where: { subdomain },
      select: {
        users: {
          where: { active: true },
          select: { email: true },
          take: 1,
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    const email = branch?.users?.[0]?.email?.toLowerCase();
    if (email) {
      emails[subdomain] = email;
      fromDb += 1;
    }
  }

  const lines = [
    '/** Gerado por back-anotaja/scripts/build-k6-tenant-admin-map.ts */',
    'export const TENANT_ADMIN_EMAILS = {',
  ];
  for (const [sub, email] of Object.entries(emails).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`  '${sub}': '${email}',`);
  }
  lines.push('};', '', "export const SEED_ADMIN_PASSWORD = '123456';", '');

  fs.writeFileSync(OUT_PATH, lines.join('\n'));
  console.log(`📦 ${fromDb}/${subdomains.length} e-mails do banco`);
  console.log(`✅ ${subdomains.length} subdomínios → ${OUT_PATH}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
