/** Utilitários para JIDs do WhatsApp (incl. @lid → @s.whatsapp.net). */

export function isLidJid(jid?: string | null): boolean {
  return !!jid && jid.endsWith('@lid');
}

export function isPhoneJid(jid?: string | null): boolean {
  return !!jid && jid.endsWith('@s.whatsapp.net');
}

export function isGroupJid(jid?: string | null): boolean {
  return !!jid && jid.endsWith('@g.us');
}

/** Registra par LID ↔ telefone no mapa bidirecional. */
export function registerLidPair(
  map: Map<string, string>,
  a?: string | null,
  b?: string | null,
): void {
  if (!a || !b) return;
  if (isLidJid(a) && isPhoneJid(b)) {
    map.set(a, b);
    map.set(b, a);
  } else if (isLidJid(b) && isPhoneJid(a)) {
    map.set(b, a);
    map.set(a, b);
  }
}

/**
 * Extrai JIDs candidatos do payload do webhook / mensagem Evolution.
 * Prioriza @s.whatsapp.net sobre @lid.
 */
export function pickContactJids(
  key: any,
  data: any,
  extraCandidates: string[] = [],
): {
  phoneJid: string | null;
  lidJid: string | null;
  rawJid: string | null;
} {
  const candidates: string[] = [
    ...extraCandidates,
    data?.remoteJidAlt,
    data?.senderPn,
    data?.sender,
    key?.participant,
    data?.participant,
    data?.user,
    key?.remoteJid,
    data?.remoteJid,
  ].filter((c): c is string => typeof c === 'string' && c.length > 3);

  let phoneJid: string | null = null;
  let lidJid: string | null = null;

  for (const c of candidates) {
    if (c === 'status@broadcast') continue;
    if (isGroupJid(c)) continue;
    if (isPhoneJid(c)) phoneJid ??= c;
    if (isLidJid(c)) lidJid ??= c;
  }

  const rawJid = phoneJid ?? lidJid;
  return { phoneJid, lidJid, rawJid };
}

/** Resolve @lid para telefone usando mapa; se já for telefone, retorna como está. */
export function resolveJidWithMap(jid: string, lidMap: Map<string, string>): string {
  if (!isLidJid(jid)) return jid;
  return lidMap.get(jid) ?? jid;
}

/** Extrai dígitos do telefone a partir de um JID @s.whatsapp.net. */
export function phoneFromJid(jid: string): string {
  if (isPhoneJid(jid)) return jid.replace('@s.whatsapp.net', '');
  return jid.split('@')[0];
}
