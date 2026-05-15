import { registerLidPair } from './whatsapp-jid.util';

/**
 * Constrói mapa bidirecional LID ↔ telefone a partir de contatos e mensagens da Evolution API.
 */
export function buildLidMapFromEvolutionData(
  contacts: any[],
  messages: any[],
): Map<string, string> {
  const map = new Map<string, string>();

  for (const c of contacts) {
    const jid = c.remoteJid || c.id || c.jid;
    const alt = c.remoteJidAlt || c.lid;
    registerLidPair(map, jid, alt);
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
