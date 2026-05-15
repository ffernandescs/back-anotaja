import { isInstancePhone, isLidJid, isPhoneJid } from './whatsapp-jid.util';

/** Varre objeto da mensagem Evolution em busca de JIDs @s.whatsapp.net válidos. */
export function extractPhoneJidsFromPayload(
  root: unknown,
  instancePhone?: string | null,
): string[] {
  const found = new Set<string>();

  const visit = (obj: unknown, depth = 0): void => {
    if (!obj || depth > 12) return;
    if (typeof obj === 'string') {
      if (isPhoneJid(obj) && !isInstancePhone(obj, instancePhone)) {
        found.add(obj);
      }
      return;
    }
    if (Array.isArray(obj)) {
      for (const item of obj) visit(item, depth + 1);
      return;
    }
    if (typeof obj === 'object') {
      for (const value of Object.values(obj as Record<string, unknown>)) {
        visit(value, depth + 1);
      }
    }
  };

  visit(root);
  return [...found];
}

/** Candidatos diretos em mensagem Evolution (campos conhecidos). */
export function pickPhoneFromMessage(
  m: any,
  instancePhone?: string | null,
): string | null {
  const candidates = [
    m?.senderPn,
    m?.remoteJidAlt,
    m?.participant,
    m?.key?.participant,
    m?.key?.remoteJidAlt,
    m?.message?.senderKeyDistributionMessage?.groupId,
  ].filter((c): c is string => typeof c === 'string');

  for (const c of candidates) {
    if (isPhoneJid(c) && !isInstancePhone(c, instancePhone)) return c;
  }

  const deep = extractPhoneJidsFromPayload(m, instancePhone);
  return deep[0] ?? null;
}

/** Indica se o envelope da mensagem Evolution referencia o chat @lid (incl. alt/participant). */
export function messageReferencesLid(m: any, lidJid: string): boolean {
  if (!lidJid || !m) return false;
  const jid = m?.key?.remoteJid ?? m?.remoteJid;
  if (jid === lidJid) return true;
  if (m?.remoteJidAlt === lidJid || m?.key?.remoteJidAlt === lidJid) return true;
  if (m?.participant === lidJid || m?.key?.participant === lidJid) return true;
  return false;
}

/**
 * Mesma ideia que pickPhoneFromLidMessages, mas varre qualquer mensagem que
 * reference o LID (útil quando remoteJid do chat é @lid e só há fromMe).
 */
export function pickPhoneForLidDeepScan(
  messages: any[],
  lidJid: string,
  instancePhone?: string | null,
): string | null {
  const quick = pickPhoneFromLidMessages(messages, lidJid, instancePhone);
  if (quick) return quick;

  for (const m of messages) {
    if (!messageReferencesLid(m, lidJid)) continue;
    const phone = pickPhoneFromMessage(m, instancePhone);
    if (phone) return phone;
  }
  return null;
}

/** Prioriza telefone do cliente em chat @lid (ignora fromMe). */
export function pickPhoneFromLidMessages(
  messages: any[],
  lidJid: string,
  instancePhone?: string | null,
): string | null {
  const inChat = messages.filter(
    (m) => (m?.key?.remoteJid ?? m?.remoteJid) === lidJid,
  );

  for (const m of inChat) {
    if (m?.key?.fromMe) continue;
    const phone = pickPhoneFromMessage(m, instancePhone);
    if (phone) return phone;
  }

  for (const m of inChat) {
    const phone = pickPhoneFromMessage(m, instancePhone);
    if (phone) return phone;
  }

  for (const m of messages) {
    const jid = m?.key?.remoteJid ?? m?.remoteJid;
    if (jid !== lidJid && !isLidJid(jid)) continue;
    const phone = pickPhoneFromMessage(m, instancePhone);
    if (phone) return phone;
  }

  return null;
}
