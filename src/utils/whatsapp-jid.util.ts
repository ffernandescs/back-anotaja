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

export function digitsOnly(value: string): string {
  return String(value).replace(/\D/g, '');
}

/**
 * Compara telefones BR (ignora 55, variação do 9º dígito).
 * Usado para não confundir o número da instância Evolution com o do cliente.
 */
export function phonesMatch(a: string, b: string): boolean {
  const da = digitsOnly(a);
  const db = digitsOnly(b);
  if (!da || !db) return false;

  const local = (d: string) => (d.startsWith('55') && d.length > 11 ? d.slice(2) : d.startsWith('55') ? d.slice(2) : d);

  const na = local(da);
  const nb = local(db);

  const variants = (n: string): string[] => {
    const out = new Set<string>([n]);
    if (n.length === 11 && n[2] === '9') out.add(n.slice(0, 2) + n.slice(3));
    if (n.length === 10) out.add(n.slice(0, 2) + '9' + n.slice(2));
    const tail = n.slice(-8);
    if (tail) out.add(tail);
    return [...out];
  };

  const va = variants(na);
  const vb = variants(nb);
  return va.some((x) => vb.some((y) => x === y || x.endsWith(y) || y.endsWith(x)));
}

/** true se o JID/telefone é o mesmo da instância WhatsApp conectada. */
export function isInstancePhone(phoneOrJid: string, instancePhone?: string | null): boolean {
  if (!instancePhone || !phoneOrJid) return false;
  return phonesMatch(phoneFromJid(phoneOrJid.includes('@') ? phoneOrJid : `${phoneOrJid}@s.whatsapp.net`), instancePhone);
}
