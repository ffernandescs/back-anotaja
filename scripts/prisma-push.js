require('dotenv').config({ path: '.env' });
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ DATABASE_URL não encontrada no arquivo .env');
  process.exit(1);
}

console.log('📦 Executando prisma db push para Neon...');
const dbInfo = databaseUrl.includes('@') ? databaseUrl.split('@')[1] : 'conectando...';
console.log(`🔗 Database: ${dbInfo.split('?')[0] || dbInfo}`);

// Para Prisma 7.x com Neon, precisamos criar um prisma.config.ts temporariamente
const configPath = path.join(__dirname, '../prisma/config.ts');
const schemaPath = path.join(__dirname, '../prisma/schema.prisma');

// Criar prisma.config.ts para Prisma 7.x db push
const configContent = `import { defineDatasource } from '@prisma/internals';

export default defineDatasource({
  provider: 'postgresql',
  url: process.env.DATABASE_URL || '',
});
`;

// Salvar config.ts
fs.writeFileSync(configPath, configContent);
console.log('📝 Arquivo prisma/config.ts criado temporariamente...');

try {
  console.log('🔄 Sincronizando schema com o banco de dados Neon...');
  
  const envWithDb = { ...process.env, DATABASE_URL: databaseUrl };
  
  // Usar db push com Prisma 7.x - ele deve usar o prisma.config.ts automaticamente
  execSync('npx prisma db push --schema=./prisma/schema.prisma --accept-data-loss', {
    stdio: 'inherit',
    env: envWithDb,
    shell: process.platform === 'win32',
    encoding: 'utf8',
    cwd: path.join(__dirname, '..'),
  });
  
  console.log('✅ Schema sincronizado com sucesso!');
  console.log('🔄 Gerando Prisma Client...');
  
  execSync('npx prisma generate --schema=./prisma/schema.prisma', {
    stdio: 'inherit',
    env: envWithDb,
    shell: process.platform === 'win32',
    encoding: 'utf8',
    cwd: path.join(__dirname, '..'),
  });
  
  console.log('✅ Prisma Client gerado com sucesso!');
  console.log('✅ Tabela notification_reads deve estar disponível agora!');
} catch (error) {
  console.error('❌ Erro ao executar prisma db push');
  if (error.message) {
    console.error(error.message);
  }
  if (error.stderr) {
    console.error(error.stderr.toString());
  }
  process.exit(1);
} finally {
  // Manter o config.ts pois pode ser útil para futuros db push
  // Mas avisar que não é usado no runtime
  console.log('ℹ️  Nota: O prisma/config.ts é usado apenas para db push, não para runtime.');
  console.log('ℹ️  O PrismaService usa o adapter diretamente, então não precisa do config.ts no runtime.');
}
