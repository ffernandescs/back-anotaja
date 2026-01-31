require('dotenv').config({ path: '.env' });
const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ DATABASE_URL não encontrada no arquivo .env');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

const sql = `
CREATE TABLE IF NOT EXISTS notification_reads (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  metadata TEXT,
  "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_reads_userId_entityType_entityId_key 
ON notification_reads("userId", "entityType", "entityId");

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'notification_reads_userId_fkey'
  ) THEN
    ALTER TABLE notification_reads 
    ADD CONSTRAINT notification_reads_userId_fkey 
    FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
`;

pool.query(sql)
  .then(() => {
    return pool.end();
  })
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro ao criar tabela:', error.message);
    console.error(error);
    pool.end();
    process.exit(1);
  });

