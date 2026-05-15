import { registerLidPair } from './whatsapp-jid.util';

/** Normaliza respostas da Evolution (array, records, data ou objeto). */
export function normalizeEvolutionList(data: unknown): any[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  const obj = data as Record<string, unknown>;
  if (Array.isArray(obj.records)) return obj.records;
  if (Array.isArray(obj.data)) return obj.data;
  if (Array.isArray(obj.chats)) return obj.chats;
  if (typeof data === 'object') return Object.values(data as object);
  return [];
}

/**
 * Constrói mapa bidirecional LID ↔ telefone a partir de contatos, chats e mensagens.
 */
export function buildLidMapFromEvolutionData(
  contacts: any[],
  messages: any[],
  chats: any[] = [],
): Map<string, string> {
  const map = new Map<string, string>();

  for (const c of contacts) {
    const jid = c.remoteJid || c.id || c.jid;
    const alt = c.remoteJidAlt || c.lid;
    registerLidPair(map, jid, alt);
  }

  for (const c of chats) {
    const jid = c.remoteJid || c.id || c.jid;
    const alt = c.remoteJidAlt || c.lid;
    registerLidPair(map, jid, alt);
    registerLidPair(map, jid, c.lastMessage?.key?.participant);
    registerLidPair(map, jid, c.lastMessage?.senderPn);
    registerLidPair(map, jid, c.lastMessage?.remoteJidAlt);
  }

  for (const m of messages) {
    const jid = m.key?.remoteJid ?? m.remoteJid;
    if (!jid) continue;

    registerLidPair(map, jid, m.remoteJidAlt);
    registerLidPair(map, jid, m.senderPn);
    registerLidPair(map, jid, m.participant);
    registerLidPair(map, jid, m.key?.participant);

    // Aprendizado: mensagens recebidas em @lid costumam trazer o telefone real
    if (jid.includes('@lid') && !m.key?.fromMe) {
      const phoneJid =
        m.senderPn ||
        m.remoteJidAlt ||
        m.participant ||
        m.key?.participant;
      registerLidPair(map, jid, phoneJid);
    }
  }

  return map;
}
