import { prisma } from '../../../lib/prisma';
import { registerLidPair } from 'src/utils/whatsapp-jid.util';

type LidPairRow = { lidJid: string; phoneJid: string };

type LidPairDelegate = {
  upsert: (args: unknown) => Promise<unknown>;
  findMany: (args: unknown) => Promise<LidPairRow[]>;
};

/** Acesso à tabela whatsapp_lid_pairs (opcional até rodar migrate + prisma generate). */
function lidPairDelegate(): LidPairDelegate | null {
  const client = prisma as unknown as { whatsAppLidPair?: LidPairDelegate };
  return client.whatsAppLidPair ?? null;
}

export async function persistLidPair(
  instanceName: string,
  lidJid: string,
  phoneJid: string,
): Promise<void> {
  const delegate = lidPairDelegate();
  if (!delegate) return;

  await delegate.upsert({
    where: { instanceName_lidJid: { instanceName, lidJid } },
    create: { instanceName, lidJid, phoneJid },
    update: { phoneJid },
  });
}

export async function loadPersistedLidPairs(
  instanceName: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const delegate = lidPairDelegate();
  if (!delegate) return map;

  try {
    const rows = await delegate.findMany({
      where: { instanceName },
      take: 5000,
    });
    for (const row of rows) {
      registerLidPair(map, row.lidJid, row.phoneJid);
    }
  } catch {
    // tabela ainda não migrada
  }

  return map;
}
