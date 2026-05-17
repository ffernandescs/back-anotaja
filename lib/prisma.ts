import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

// Pool com keepAlive para evitar SocketTimeout no Neon (compute pode suspender quando ocioso).
// O Neon usa PgBouncer (URL com "-pooler"), então o pool local pode ser pequeno.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 5,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 30000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

pool.on('error', (err) => {
  console.error('[prisma pool] idle client error:', err.message);
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

export { prisma };
