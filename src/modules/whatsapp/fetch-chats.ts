import { prisma } from '../../../lib/prisma';
import { normalizeBrazilPhone } from 'src/utils/normalizePhone';
import {
  isInstancePhone,
  isLidJid,
  isPhoneJid,
  isGroupJid,
  phoneFromJid,
  registerLidPair,
  resolveJidWithMap,
  isPlausibleLocalPhone,
  digitsLookLikeLidId,
  isInstanceDisplayName,
} from 'src/utils/whatsapp-jid.util';
import { buildLidMapFromEvolutionData, normalizeEvolutionList } from 'src/utils/whatsapp-lid-map';
import { pickPhoneForLidDeepScan } from 'src/utils/whatsapp-lid-resolve';
import type { Prisma } from '@prisma/client';

interface AggregatedChat {
  remoteJid: string;
  lidJid?: string;
  lidOnly?: boolean;
  pushName: string | null;
  profilePicUrl: string | null;
  updatedAtMs: number;
}

/** OR no Prisma: pushName do WhatsApp costuma ser só o primeiro nome; cadastro pode ser "Nome Sobrenome". */
function buildCustomerBranchWhereByPushNames(names: string[]): Prisma.CustomerWhereInput[] {
  const parts: Prisma.CustomerWhereInput[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const n = raw.trim();
    if (n.length < 2 || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase());
    parts.push({ name: { equals: n, mode: 'insensitive' } });
    if (n.length >= 3) {
      parts.push({ name: { startsWith: `${n} `, mode: 'insensitive' } });
      parts.push({ name: { endsWith: ` ${n}`, mode: 'insensitive' } });
      parts.push({ name: { contains: ` ${n} `, mode: 'insensitive' } });
    }
  }
  return parts;
}

type MinimalCustomer = { name: string; phone: string };

function localPhoneDigitsFromCustomerRow(phone: string): string {
  const d = phone.replace(/\D/g, '').replace(/^55/, '');
  return isPlausibleLocalPhone(d) ? d : '';
}

/** Empata pushName com cliente quando nome cadastrado inclui o push (ex.: cadastro "Adayas Silva", push "Adayas"). */
function matchCustomerByWhatsPushName(
  push: string | null | undefined,
  pool: MinimalCustomer[],
): MinimalCustomer | null {
  const key = push?.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key || key.length < 2) return null;

  const ok = pool.filter((c) => !!localPhoneDigitsFromCustomerRow(c.phone));
  if (!ok.length) return null;

  const exact = ok.filter((c) => c.name.trim().toLowerCase() === key);
  if (exact.length === 1) return exact[0];

  const firstName = ok.filter((c) => {
    const nm = c.name.trim().toLowerCase();
    return nm.startsWith(key + ' ');
  });
  if (firstName.length === 1) return firstName[0];

  const firstTok = ok.filter((c) => {
    const tok = c.name.trim().toLowerCase().split(/\s+/)[0] ?? '';
    return tok === key;
  });
  if (firstTok.length === 1) return firstTok[0];

  if (key.length >= 3) {
    const anyTok = ok.filter((c) =>
      c.name
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .some((t) => t === key),
    );
    if (anyTok.length === 1) return anyTok[0];
  }

  return null;
}

export interface FetchChatsResult {
  chats: Array<{
    id: string;
    jid: string;
    lidJid?: string;
    remoteJid: string;
    phone: string;
    name: string;
    pushName: string | null;
    profilePicUrl: string | null;
    updatedAt: string | null;
    unreadCount: number;
    lastMessage: {
      id: string;
      text: string;
      timestamp: number;
      fromMe: boolean;
      pushName: string | null;
    } | null;
    lastMsgTimestamp: number;
    customer: any;
    ordersSummary: {
      new: number;
      pending: number;
      outForDelivery: number;
      completed: number;
    };
    totalOrders: number;
  }>;
  globalSummary: {
    new: number;
    pending: number;
    outForDelivery: number;
    completed: number;
  };
  total: number;
}

export interface FetchChatsDeps {
  instanceName: string;
  instancePhone: string | null;
  instanceProfileName?: string | null;
  branchId: string;
  configId: string;
  evolutionRequest: (method: string, path: string, body?: unknown) => Promise<unknown>;
  loadPersistedLidMap: (instanceName: string) => Promise<Map<string, string>>;
  resolveLidViaMessages: (
    instanceName: string,
    lidJid: string,
    instancePhone?: string | null,
  ) => Promise<string | null>;
  rememberLidPair: (
    instanceName: string,
    lidJid: string,
    phoneJid: string,
    instancePhone?: string | null,
  ) => void;
  summarizeOrders: (orders: any[]) => {
    new: number;
    pending: number;
    outForDelivery: number;
    completed: number;
  };
  logger?: { log: (msg: string) => void; debug: (msg: string) => void };
}

function phoneVariants(phone: string): string[] {
  const variants = [phone];
  if (phone.length < 2) return variants;
  const ddd = phone.slice(0, 2);
  const local = phone.slice(2);
  if (local.length === 9 && local[0] === '9') {
    variants.push(ddd + local.slice(1));
  } else if (local.length === 8) {
    variants.push(ddd + '9' + local);
  }
  return variants;
}

function jidToLocalPhone(jid: string): string {
  if (isLidJid(jid)) return '';
  const raw = phoneFromJid(jid);
  if (!raw || digitsLookLikeLidId(raw)) return '';
  const normalized = normalizeBrazilPhone(raw);
  if (normalized) return normalized.slice(2);
  const local = raw.startsWith('55') ? raw.slice(2) : raw;
  return isPlausibleLocalPhone(local) ? local : '';
}

function localPhoneToJid(local: string): string | null {
  const raw = local.replace(/\D/g, '');
  if (!isPlausibleLocalPhone(raw)) return null;
  const normalized = normalizeBrazilPhone(raw.startsWith('55') ? raw : `55${raw}`);
  if (!normalized) return null;
  return `${normalized}@s.whatsapp.net`;
}

/** Índice pushName → telefone local (contatos/chats/mensagens recebidas). */
function buildPushNamePhoneIndex(
  contacts: any[],
  chats: any[],
  messages: any[],
  instancePhone: string | null,
  instanceProfileName?: string | null,
): Map<string, string> {
  const index = new Map<string, string>();

  const add = (name: string | null | undefined, jid: string | null | undefined) => {
    const key = String(name ?? '').trim().toLowerCase();
    if (!key || isInstanceDisplayName(key, instanceProfileName, instancePhone)) return;
    if (!jid || !isPhoneJid(jid) || isInstancePhone(jid, instancePhone)) return;
    const local = jidToLocalPhone(jid);
    if (local) index.set(key, local);
  };

  for (const c of [...contacts, ...chats]) {
    add(c.pushName ?? c.name, c.remoteJid ?? c.id);
    add(c.pushName ?? c.name, c.remoteJidAlt ?? c.lid);
  }

  for (const m of messages) {
    if (m?.key?.fromMe) continue;
    add(m.pushName, m.key?.remoteJid ?? m.remoteJid);
    add(m.pushName, m.remoteJidAlt);
  }

  return index;
}

function extractProfilePic(item: any): string | null {
  const pic =
    item?.profilePicUrl ??
    item?.picture ??
    item?.profilePictureUrl ??
    item?.contact?.profilePictureUrl ??
    item?.contact?.profilePicUrl ??
    null;
  return typeof pic === 'string' && pic.startsWith('http') ? pic : null;
}

/** Foto por JID (incl. @lid e @s.whatsapp.net) e por telefone local. */
function buildProfilePicIndex(
  contacts: any[],
  chats: any[],
): { byJid: Map<string, string>; byLocalPhone: Map<string, string> } {
  const byJid = new Map<string, string>();
  const byLocalPhone = new Map<string, string>();

  const register = (jid: string | null | undefined, pic: string) => {
    if (!jid) return;
    if (!byJid.has(jid)) byJid.set(jid, pic);
    if (isPhoneJid(jid)) {
      const local = jidToLocalPhone(jid);
      if (local && !byLocalPhone.has(local)) byLocalPhone.set(local, pic);
    }
  };

  for (const item of [...contacts, ...chats]) {
    const pic = extractProfilePic(item);
    if (!pic) continue;
    register(item.remoteJid ?? item.id ?? item.jid, pic);
    register(item.remoteJidAlt ?? item.lid, pic);
    register(item.key?.remoteJid, pic);
  }

  return { byJid, byLocalPhone };
}

function lookupProfilePic(
  chat: AggregatedChat,
  index: { byJid: Map<string, string>; byLocalPhone: Map<string, string> },
  lidMap: Map<string, string>,
  localPhone?: string,
): string | null {
  if (chat.profilePicUrl) return chat.profilePicUrl;

  const jids = new Set<string>();
  if (chat.remoteJid) jids.add(chat.remoteJid);
  if (chat.lidJid) jids.add(chat.lidJid);

  for (const jid of jids) {
    const direct = index.byJid.get(jid);
    if (direct) return direct;
    const mapped = lidMap.get(jid);
    if (mapped) {
      const viaMap = index.byJid.get(mapped);
      if (viaMap) return viaMap;
    }
  }

  if (localPhone) {
    const byPhone = index.byLocalPhone.get(localPhone);
    if (byPhone) return byPhone;
    const phoneJid = localPhoneToJid(localPhone);
    if (phoneJid) {
      const byJid = index.byJid.get(phoneJid);
      if (byJid) return byJid;
    }
  }

  return null;
}

async function fetchEvolutionProfilePic(
  evolutionRequest: FetchChatsDeps['evolutionRequest'],
  instanceName: string,
  number: string,
): Promise<string | null> {
  const res = await evolutionRequest(
    'POST',
    `/chat/fetchProfilePictureUrl/${instanceName}`,
    { number },
  ).catch(() => null);

  if (!res || typeof res !== 'object') return null;
  const data = res as Record<string, unknown>;
  const pic = data.profilePictureUrl ?? data.profilePicUrl ?? data.picture;
  return typeof pic === 'string' && pic.startsWith('http') ? pic : null;
}

function pickBetterPushName(
  a: string | null | undefined,
  b: string | null | undefined,
  instanceProfileName?: string | null,
  instancePhone?: string | null,
): string | null {
  const valid = (n?: string | null) =>
    !!n && !isInstanceDisplayName(n, instanceProfileName, instancePhone);
  if (valid(a)) return a!;
  if (valid(b)) return b!;
  return a ?? b ?? null;
}

/** Janela para associar última atividade @lid vs @s.whatsapp.net no mesmo contato (Prisma ChatLastMessage). */
const INFER_LID_LASTMSG_WINDOW_MS = 6 * 60 * 60 * 1000;
/** Segundo melhor candidato deve ficar pelo menos este Δt atrás do melhor (evita colidir dois clientes no mesmo período). */
const INFER_LID_AMBIGUITY_GAP_MS = 12 * 60 * 1000;

/**
 * Aprende LID ↔ telefone quando o webhook grava duas linhas em ChatLastMessage
 * (app oficial costuma usar @lid; API/pedido usa @s.whatsapp.net) e o mapa Evolution ainda não ligou.
 */
function inferLidPairsFromChatLastRows(
  rows: Array<{ remoteJid: string; timestamp: bigint | number }>,
  lidMap: Map<string, string>,
  instancePhone: string | null,
  instanceName: string,
  rememberLidPair: FetchChatsDeps['rememberLidPair'],
): void {
  const lids = rows.filter(
    (r) => isLidJid(r.remoteJid) && !isInstancePhone(r.remoteJid, instancePhone),
  );
  const phones = rows.filter(
    (r) => isPhoneJid(r.remoteJid) && !isInstancePhone(r.remoteJid, instancePhone),
  );
  if (!lids.length || !phones.length) return;

  type Pick = { lid: string; phone: string; diff: number };
  const picks: Pick[] = [];

  for (const lidRow of lids) {
    const mapped = lidMap.get(lidRow.remoteJid);
    if (mapped && isPhoneJid(mapped)) continue;

    const lidTs = Number(lidRow.timestamp);
    const ranked: { phone: string; diff: number }[] = [];
    for (const phoneRow of phones) {
      const diff = Math.abs(lidTs - Number(phoneRow.timestamp));
      if (diff <= INFER_LID_LASTMSG_WINDOW_MS) {
        ranked.push({ phone: phoneRow.remoteJid, diff });
      }
    }
    ranked.sort((a, b) => a.diff - b.diff);
    if (!ranked.length) continue;

    const best = ranked[0];
    const second = ranked[1];
    if (second && second.diff - best.diff < INFER_LID_AMBIGUITY_GAP_MS) continue;

    picks.push({ lid: lidRow.remoteJid, phone: best.phone, diff: best.diff });
  }

  picks.sort((a, b) => a.diff - b.diff);

  const lidsUsed = new Set<string>();
  const phonesUsed = new Set<string>();

  for (const c of picks) {
    if (lidsUsed.has(c.lid) || phonesUsed.has(c.phone)) continue;
    lidsUsed.add(c.lid);
    phonesUsed.add(c.phone);
    registerLidPair(lidMap, c.lid, c.phone);
    rememberLidPair(instanceName, c.lid, c.phone, instancePhone);
  }
}

function collectDistinctLids(params: {
  localLastRows: Array<{ remoteJid: string }>;
  rawChats: any[];
  recentMessages: any[];
}): Set<string> {
  const lids = new Set<string>();
  const tryAdd = (j?: string | null) => {
    if (!j || typeof j !== 'string') return;
    if (isLidJid(j)) lids.add(j);
  };

  for (const r of params.localLastRows) tryAdd(r.remoteJid);

  for (const c of params.rawChats) {
    tryAdd(c.remoteJid ?? c.id ?? c.jid);
    tryAdd(c.remoteJidAlt ?? c.lid);
  }

  for (const m of params.recentMessages) {
    tryAdd(m?.key?.remoteJid ?? m?.remoteJid);
    tryAdd(m?.remoteJidAlt ?? m?.key?.remoteJidAlt);
  }

  return lids;
}

function enrichLidMapFromMessageDeepScan(
  lidMap: Map<string, string>,
  recentMessages: any[],
  lids: Set<string>,
  instanceName: string,
  instancePhone: string | null,
  rememberLidPair: FetchChatsDeps['rememberLidPair'],
): void {
  for (const lid of lids) {
    const mapped = lidMap.get(lid);
    if (mapped && isPhoneJid(mapped) && !isInstancePhone(mapped, instancePhone)) continue;

    const phone = pickPhoneForLidDeepScan(recentMessages, lid, instancePhone);
    if (phone && isPhoneJid(phone) && !isInstancePhone(phone, instancePhone)) {
      registerLidPair(lidMap, lid, phone);
      rememberLidPair(instanceName, lid, phone, instancePhone);
    }
  }
}

function getAggregatedLocalPhone(
  key: string,
  chat: AggregatedChat,
  lidMap: Map<string, string>,
  pushNamePhoneIndex: Map<string, string>,
): string {
  if (!chat.lidOnly && isPhoneJid(chat.remoteJid)) {
    const local = jidToLocalPhone(chat.remoteJid);
    if (local) return local;
  }

  const lid =
    chat.lidJid ??
    (isLidJid(key) ? key : isLidJid(chat.remoteJid) ? chat.remoteJid : undefined);

  if (lid) {
    const mapped = lidMap.get(lid);
    if (mapped && isPhoneJid(mapped)) {
      const local = jidToLocalPhone(mapped);
      if (local) return local;
    }
  }

  const pushKey = chat.pushName?.trim().toLowerCase();
  if (pushKey) {
    const fromIndex = pushNamePhoneIndex.get(pushKey);
    if (fromIndex) return fromIndex;
  }

  return '';
}

function mergeKeysIntoCanonical(
  aggregated: Map<string, AggregatedChat>,
  keys: string[],
  lidMap: Map<string, string>,
  instanceName: string,
  instancePhone: string | null,
  rememberLidPair: FetchChatsDeps['rememberLidPair'],
  instanceProfileName?: string | null,
): void {
  const phoneKey =
    keys.find((k) => isPhoneJid(k) && !isLidJid(k)) ??
    keys.find((k) => {
      const c = aggregated.get(k);
      return c && !c.lidOnly && isPhoneJid(c.remoteJid);
    }) ??
    keys[0];

  let merged = aggregated.get(phoneKey)!;

  for (const key of keys) {
    if (key === phoneKey) continue;
    const other = aggregated.get(key);
    if (!other) continue;

    const lidJid = isLidJid(key)
      ? key
      : other.lidJid ?? (isLidJid(other.remoteJid) ? other.remoteJid : undefined);

    if (lidJid && isPhoneJid(phoneKey)) {
      registerLidPair(lidMap, lidJid, phoneKey);
      rememberLidPair(instanceName, lidJid, phoneKey, instancePhone);
    }

    merged = pickNewerChat(
      {
        ...merged,
        remoteJid: phoneKey,
        lidOnly: false,
        lidJid: merged.lidJid ?? lidJid,
      },
      other,
      instanceProfileName,
      instancePhone,
    );
    aggregated.delete(key);
    if (lidJid && lidJid !== key) aggregated.delete(lidJid);
  }

  aggregated.set(phoneKey, merged);
}

/**
 * Une entradas órfãs @lid com a conversa @s.whatsapp.net quando o mapa LID já resolve o par
 * (persistência, inferência por ChatLastMessage ou varredura nas mensagens).
 */
function mergeLidMappedOrphans(
  aggregated: Map<string, AggregatedChat>,
  lidMap: Map<string, string>,
  instanceName: string,
  instancePhone: string | null,
  rememberLidPair: FetchChatsDeps['rememberLidPair'],
  instanceProfileName?: string | null,
): void {
  for (const key of [...aggregated.keys()]) {
    const mappedPhone = lidMap.get(key);
    if (!mappedPhone || !isPhoneJid(mappedPhone)) continue;
    if (isInstancePhone(mappedPhone, instancePhone)) continue;
    if (key === mappedPhone) continue;
    if (!aggregated.has(key) || !aggregated.has(mappedPhone)) continue;

    mergeKeysIntoCanonical(
      aggregated,
      [key, mappedPhone],
      lidMap,
      instanceName,
      instancePhone,
      rememberLidPair,
      instanceProfileName,
    );
  }
}

/** Une conversas duplicadas (@lid + @s.whatsapp.net) no mesmo contato. */
function mergeAggregatedChats(
  aggregated: Map<string, AggregatedChat>,
  lidMap: Map<string, string>,
  pushNamePhoneIndex: Map<string, string>,
  instanceName: string,
  instancePhone: string | null,
  rememberLidPair: FetchChatsDeps['rememberLidPair'],
  instanceProfileName?: string | null,
): void {
  const byLocal = new Map<string, string[]>();

  for (const [key, chat] of aggregated) {
    const local = getAggregatedLocalPhone(key, chat, lidMap, pushNamePhoneIndex);
    if (!local || digitsLookLikeLidId(local)) continue;
    const list = byLocal.get(local) ?? [];
    list.push(key);
    byLocal.set(local, list);
  }

  for (const keys of byLocal.values()) {
    if (keys.length < 2) continue;
    mergeKeysIntoCanonical(
      aggregated,
      keys,
      lidMap,
      instanceName,
      instancePhone,
      rememberLidPair,
      instanceProfileName,
    );
  }

  mergeLidMappedOrphans(
    aggregated,
    lidMap,
    instanceName,
    instancePhone,
    rememberLidPair,
    instanceProfileName,
  );
}

function pickNewerChat(
  current: AggregatedChat,
  incoming: AggregatedChat,
  instanceProfileName?: string | null,
  instancePhone?: string | null,
): AggregatedChat {
  if (incoming.updatedAtMs >= current.updatedAtMs) {
    return {
      ...incoming,
      lidJid: incoming.lidJid ?? current.lidJid,
      pushName: pickBetterPushName(incoming.pushName, current.pushName, instanceProfileName, instancePhone),
      profilePicUrl: incoming.profilePicUrl ?? current.profilePicUrl,
    };
  }
  return {
    ...current,
    lidJid: current.lidJid ?? incoming.lidJid,
    pushName: pickBetterPushName(current.pushName, incoming.pushName, instanceProfileName, instancePhone),
    profilePicUrl: current.profilePicUrl ?? incoming.profilePicUrl,
  };
}

/**
 * Lista conversas do CRM — uma entrada por contato (telefone), sem @lid nem instância.
 */
export async function fetchChatsForBranch(deps: FetchChatsDeps): Promise<FetchChatsResult> {
  const {
    instanceName,
    instancePhone,
    instanceProfileName,
    branchId,
    configId,
    evolutionRequest,
    loadPersistedLidMap,
    resolveLidViaMessages,
    rememberLidPair,
    summarizeOrders,
    logger,
  } = deps;

  // ── 1. Evolution: chats + mapa LID ─────────────────────────────────────
  const rawChats = await evolutionRequest('POST', `/chat/findChats/${instanceName}`, {
    where: {},
  })

    .then((r) => normalizeEvolutionList(r))
    .catch(() => [] as any[]);

  const contacts = await evolutionRequest('POST', `/chat/findContacts/${instanceName}`, {
    where: {},
    limit: 2000,
  })
    .then((r) => normalizeEvolutionList(r))
    .catch(() => [] as any[]);

  const recentMessages = await evolutionRequest(
    'POST',
    `/chat/findMessages/${instanceName}`,
    { where: {}, limit: 300 },
  )
    .then((r) => extractMessagesList(r))
    .catch(() => [] as any[]);

  const lidMap = buildLidMapFromEvolutionData(contacts, recentMessages, rawChats);
  const persisted = await loadPersistedLidMap(instanceName);
  for (const [k, v] of persisted) registerLidPair(lidMap, k, v);
  purgeInstanceFromLidMap(lidMap, instancePhone);

  const localLastRows = await prisma.chatLastMessage.findMany({
    where: { branchId },
    orderBy: { timestamp: 'desc' },
  });

  const lidsToEnrich = collectDistinctLids({
    localLastRows,
    rawChats,
    recentMessages,
  });
  enrichLidMapFromMessageDeepScan(
    lidMap,
    recentMessages,
    lidsToEnrich,
    instanceName,
    instancePhone,
    rememberLidPair,
  );
  inferLidPairsFromChatLastRows(localLastRows, lidMap, instancePhone, instanceName, rememberLidPair);

  const pushNamePhoneIndex = buildPushNamePhoneIndex(
    contacts,
    rawChats,
    recentMessages,
    instancePhone,
    instanceProfileName,
  );

  const profilePicIndex = buildProfilePicIndex(contacts, rawChats);

  // ── 2. Resolver JID → telefone ─────────────────────────────────────────
  type ResolvedChat =
    | { phoneJid: string; lidJid?: string; lidOnly?: false }
    | { phoneJid: string; lidJid: string; lidOnly: true };

  const resolveToPhone = async (rawJid: string): Promise<ResolvedChat | null> => {
    if (!rawJid || isGroupJid(rawJid) || isInstancePhone(rawJid, instancePhone)) {
      return null;
    }

    const lidFromRaw = isLidJid(rawJid) ? rawJid : undefined;
    let phoneJid: string | null = isPhoneJid(rawJid) ? rawJid : null;

    if (!phoneJid && lidFromRaw) {
      const mapped = lidMap.get(lidFromRaw);
      if (mapped && isPhoneJid(mapped) && !isInstancePhone(mapped, instancePhone)) {
        phoneJid = mapped;
      }
    }

    if (!phoneJid && lidFromRaw) {
      const fromApi = await resolveLidViaMessages(instanceName, lidFromRaw, instancePhone);
      if (fromApi) {
        phoneJid = fromApi;
        rememberLidPair(instanceName, lidFromRaw, fromApi, instancePhone);
        registerLidPair(lidMap, lidFromRaw, fromApi);
      }
    }

    if (!phoneJid && isPhoneJid(rawJid)) {
      phoneJid = rawJid;
    }

    if (phoneJid && isPhoneJid(phoneJid) && !isInstancePhone(phoneJid, instancePhone)) {
      let lidJid = lidFromRaw;
      if (!lidJid) {
        const alt = lidMap.get(phoneJid);
        if (alt && isLidJid(alt)) lidJid = alt;
      }
      return { phoneJid, lidJid, lidOnly: false };
    }

    // Mantém conversa visível mesmo sem telefone resolvido
    if (lidFromRaw) {
      return { phoneJid: lidFromRaw, lidJid: lidFromRaw, lidOnly: true };
    }

    return null;
  };

  // ── 3. Agregar por telefone ou @lid (deduplica quando resolvido) ───────
  const aggregated = new Map<string, AggregatedChat>();

  const upsert = (resolved: ResolvedChat, meta: Partial<AggregatedChat>) => {
    const incoming: AggregatedChat = {
      remoteJid: resolved.phoneJid,
      lidJid: resolved.lidJid,
      lidOnly: resolved.lidOnly,
      pushName: meta.pushName ?? null,
      profilePicUrl: meta.profilePicUrl ?? null,
      updatedAtMs: meta.updatedAtMs ?? 0,
    };

    const existing = aggregated.get(resolved.phoneJid);
    aggregated.set(
      resolved.phoneJid,
      existing ? pickNewerChat(existing, incoming, instanceProfileName, instancePhone) : incoming,
    );

    // Se descobriu telefone, remove entrada @lid órfã duplicada
    if (!resolved.lidOnly && resolved.lidJid && resolved.lidJid !== resolved.phoneJid) {
      aggregated.delete(resolved.lidJid);
    }
  };

  for (const c of rawChats) {
    const rawJid = String(c.remoteJid ?? c.id ?? '');
    const resolved = await resolveToPhone(rawJid);
    if (!resolved) continue;

    const alt = c.remoteJidAlt || c.lid;
    if (alt && isPhoneJid(alt) && !isInstancePhone(alt, instancePhone)) {
      registerLidPair(lidMap, rawJid, alt);
    }

    upsert(resolved, {
      pushName: c.pushName ?? c.name ?? null,
      profilePicUrl: c.profilePicUrl ?? c.picture ?? null,
      updatedAtMs: toMs(c.updatedAt ?? c.messageTimestamp),
    });
  }

  const inboundPushNameByJid = new Map<string, string>();
  for (const row of localLastRows) {
    if (!row.fromMe && row.pushName && !isInstanceDisplayName(row.pushName, instanceProfileName, instancePhone)) {
      inboundPushNameByJid.set(row.remoteJid, row.pushName);
    }
  }

  for (const row of localLastRows) {
    const resolved = await resolveToPhone(row.remoteJid);
    if (!resolved) continue;

    const pushName =
      inboundPushNameByJid.get(row.remoteJid) ??
      (!row.fromMe ? row.pushName : null);

    upsert(resolved, {
      pushName: pushName ?? null,
      updatedAtMs: Number(row.timestamp),
    });
  }

  mergeAggregatedChats(
    aggregated,
    lidMap,
    pushNamePhoneIndex,
    instanceName,
    instancePhone,
    rememberLidPair,
    instanceProfileName,
  );

  const chatList = [...aggregated.values()];

  for (const chat of chatList) {
    const jids = [chat.remoteJid, chat.lidJid].filter(Boolean) as string[];
    for (const jid of jids) {
      const inbound = inboundPushNameByJid.get(jid);
      if (inbound) {
        chat.pushName = pickBetterPushName(chat.pushName, inbound, instanceProfileName, instancePhone);
        break;
      }
    }
  }
  for (const m of recentMessages) {
    if (m?.key?.fromMe || !m.pushName) continue;
    if (isInstanceDisplayName(m.pushName, instanceProfileName, instancePhone)) continue;
    const jid = m.key?.remoteJid ?? m.remoteJid;
    if (!jid || !isLidJid(jid)) continue;
    for (const chat of chatList) {
      if (chat.remoteJid === jid || chat.lidJid === jid) {
        chat.pushName = pickBetterPushName(chat.pushName, m.pushName, instanceProfileName, instancePhone);
      }
    }
  }

  if (!chatList.length) {
    const orders = await prisma.order.findMany({
      where: { branchId, status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'READY', 'DELIVERING', 'DELIVERED', 'COMPLETED'] } },
    });
    return {
      chats: [],
      globalSummary: buildGlobalSummary(orders),
      total: 0,
    };
  }

  // ── 4. Última mensagem + não lidas (batch) ─────────────────────────────
  const jidsForQuery = new Set<string>();
  for (const c of chatList) {
    jidsForQuery.add(c.remoteJid);
    if (c.lidJid) jidsForQuery.add(c.lidJid);
  }

  const lastRows = await prisma.chatLastMessage.findMany({
    where: { branchId, remoteJid: { in: [...jidsForQuery] } },
  });
  const lastByJid = new Map(lastRows.map((r) => [r.remoteJid, r]));

  const unreadRows = await prisma.whatsAppChatRead.findMany({
    where: { branchId: configId, jid: { in: [...jidsForQuery] } },
  });
  const unreadByJid = new Map(unreadRows.map((r) => [r.jid, r.unreadCount]));

  const pickLast = (phoneJid: string, lidJid?: string) => {
    const a = lastByJid.get(phoneJid);
    const b = lidJid ? lastByJid.get(lidJid) : undefined;
    if (!a) return b ?? null;
    if (!b) return a;
    return Number(a.timestamp) >= Number(b.timestamp) ? a : b;
  };

  const unreadFor = (phoneJid: string, lidJid?: string) =>
    (unreadByJid.get(phoneJid) ?? 0) + (lidJid ? unreadByJid.get(lidJid) ?? 0 : 0);

  // ── 5. Clientes + pedidos ──────────────────────────────────────────────
  const phoneToLocal = new Map<string, string>();
  const allVariants = new Set<string>();

  const lidOnlyChats = chatList.filter((c) => c.lidOnly || isLidJid(c.remoteJid));
  const namesForLookup = [
    ...new Set(
      lidOnlyChats
        .map((c) => c.pushName?.trim())
        .filter((n): n is string => !!n && n.length >= 2),
    ),
  ];

  const nameOrParts = buildCustomerBranchWhereByPushNames(namesForLookup);

  const customersByName =
    nameOrParts.length > 0
      ? await prisma.customer.findMany({
          where: {
            branchId,
            OR: nameOrParts,
          },
        })
      : [];

  const resolveLidLocalPhone = (chat: AggregatedChat): string => {
    const lid = chat.lidJid ?? (isLidJid(chat.remoteJid) ? chat.remoteJid : undefined);
    if (!lid) return '';

    const mappedJid = lidMap.get(lid);
    if (mappedJid && isPhoneJid(mappedJid)) {
      const local = jidToLocalPhone(mappedJid);
      if (local) return local;
    }

    const fromMessages = pickPhoneForLidDeepScan(recentMessages, lid, instancePhone);
    if (fromMessages) {
      const local = jidToLocalPhone(fromMessages);
      if (local) {
        rememberLidPair(instanceName, lid, fromMessages, instancePhone);
        registerLidPair(lidMap, lid, fromMessages);
        return local;
      }
    }

    const pushNorm = chat.pushName?.trim().toLowerCase();
    if (pushNorm) {
      const fromContact = pushNamePhoneIndex.get(pushNorm);
      if (fromContact) return fromContact;
      const cust = matchCustomerByWhatsPushName(chat.pushName, customersByName);
      if (cust) {
        const digits = localPhoneDigitsFromCustomerRow(cust.phone);
        if (digits) return digits;
      }
    }

    return '';
  };

  /** Última tentativa: mensagens CRM salvas com customerPhone mesmo quando remoteJid ainda era @lid. */
  const prismaLocalPhoneByLid = new Map<string, string>();

  async function loadPrismaLocalPhoneForLid(lidJid: string): Promise<void> {
    if (prismaLocalPhoneByLid.has(lidJid)) return;
    prismaLocalPhoneByLid.set(lidJid, '');
    try {
      const row = await prisma.whatsAppMessage.findFirst({
        where: {
          branchId,
          remoteJid: lidJid,
          customerPhone: { not: '' },
        },
        orderBy: { sentAt: 'desc' },
        select: { customerPhone: true },
      });
      const raw = row?.customerPhone?.trim() ?? '';
      const digits = raw.replace(/\D/g, '');
      if (digits.length < 10 || digitsLookLikeLidId(digits)) return;
      const local = digits.startsWith('55') ? digits.slice(2) : digits;
      if (isPlausibleLocalPhone(local)) prismaLocalPhoneByLid.set(lidJid, local);
    } catch {
      // ignore
    }
  }

  const lidFetchedPhoneViaApi = new Set<string>();

  for (const c of chatList) {
    let local =
      c.lidOnly || isLidJid(c.remoteJid)
        ? resolveLidLocalPhone(c)
        : jidToLocalPhone(c.remoteJid);

    const isLidChat = c.lidOnly || isLidJid(c.remoteJid);
    const lid = c.lidJid ?? (isLidJid(c.remoteJid) ? c.remoteJid : undefined);

    if (isLidChat && lid && (!local || digitsLookLikeLidId(local))) {
      if (!lidFetchedPhoneViaApi.has(lid)) {
        lidFetchedPhoneViaApi.add(lid);
        const phoneJid = await resolveLidViaMessages(instanceName, lid, instancePhone);
        if (phoneJid && isPhoneJid(phoneJid) && !isInstancePhone(phoneJid, instancePhone)) {
          rememberLidPair(instanceName, lid, phoneJid, instancePhone);
          registerLidPair(lidMap, lid, phoneJid);
        }
      }
      local = resolveLidLocalPhone(c);
      if (!local || digitsLookLikeLidId(local)) {
        await loadPrismaLocalPhoneForLid(lid);
        const fromPrisma = prismaLocalPhoneByLid.get(lid) ?? '';
        if (fromPrisma) local = fromPrisma;
      }
    }

    if (local && digitsLookLikeLidId(local)) local = '';

    phoneToLocal.set(c.remoteJid, local);
    if (local) {
      for (const v of phoneVariants(local)) {
        allVariants.add(v);
      }
    }
  }

  const customers = await prisma.customer.findMany({
    where: { branchId, phone: { in: [...allVariants] } },
    include: { addresses: { where: { isDefault: true } } },
  });

  const customerByVariant = new Map<string, (typeof customers)[0]>();
  for (const cust of customers) {
    for (const v of phoneVariants(cust.phone)) {
      customerByVariant.set(v, cust);
    }
  }

  const resolveCustomer = (chat: AggregatedChat) => {
    const local =
      phoneToLocal.get(chat.remoteJid) ??
      (chat.lidJid ? phoneToLocal.get(chat.lidJid) : '') ??
      jidToLocalPhone(chat.remoteJid);
    if (!local || digitsLookLikeLidId(local)) return null;
    for (const v of phoneVariants(local)) {
      const found = customerByVariant.get(v);
      if (found) return found;
    }
    return null;
  };

  const customerIds = customers.map((c) => c.id);
  const orders = customerIds.length
    ? await prisma.order.findMany({
        where: { branchId, customerId: { in: customerIds } },
        orderBy: { createdAt: 'desc' },
      })
    : [];

  const ordersByCustomer = new Map<string, typeof orders>();
  for (const o of orders) {
    if (!o.customerId) continue;
    const list = ordersByCustomer.get(o.customerId) ?? [];
    list.push(o);
    ordersByCustomer.set(o.customerId, list);
  }

  // ── 6. Montar resposta ─────────────────────────────────────────────────
  const chats = chatList.map((c) => {
    let phone = phoneToLocal.get(c.remoteJid) ?? '';
    if (!phone && !c.lidOnly && !isLidJid(c.remoteJid)) {
      phone = jidToLocalPhone(c.remoteJid);
    }
    if (phone && digitsLookLikeLidId(phone)) phone = '';

    const customer = resolveCustomer(c);
    const last = pickLast(c.remoteJid, c.lidJid);
    const customerOrders = customer ? ordersByCustomer.get(customer.id) ?? [] : [];
    const displayName = customer?.name ?? c.pushName ?? (phone || 'Contato');

    const lastMsgTimestamp = last ? Number(last.timestamp) : 0;

    const canonicalJid =
      !c.lidOnly && isPhoneJid(c.remoteJid)
        ? c.remoteJid
        : phone
          ? localPhoneToJid(phone) ?? c.remoteJid
          : c.remoteJid;

    const profilePicUrl =
      lookupProfilePic(c, profilePicIndex, lidMap, phone) ?? c.profilePicUrl;

    return {
      id: canonicalJid,
      jid: canonicalJid,
      lidJid: c.lidJid && c.lidJid !== canonicalJid ? c.lidJid : c.lidOnly ? c.remoteJid : undefined,
      remoteJid: canonicalJid,
      phone,
      name: displayName,
      pushName: c.pushName,
      profilePicUrl,
      updatedAt: c.updatedAtMs ? new Date(c.updatedAtMs).toISOString() : null,
      unreadCount: unreadFor(c.remoteJid, c.lidJid),
      lastMsgTimestamp,
      lastMessage: last
        ? {
            id: last.messageId,
            text: last.text ?? '',
            timestamp: lastMsgTimestamp,
            fromMe: last.fromMe,
            pushName: last.pushName ?? null,
          }
        : null,
      customer,
      ordersSummary: summarizeOrders(customerOrders),
      totalOrders: customerOrders.length,
    };
  });

  chats.sort((a, b) => (b.lastMsgTimestamp ?? 0) - (a.lastMsgTimestamp ?? 0));

  return {
    chats,
    globalSummary: buildGlobalSummary(orders),
    total: chats.length,
  };
}

function extractMessagesList(result: unknown): any[] {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  const r = result as Record<string, unknown>;
  if (Array.isArray(r.messages)) return r.messages as any[];
  const messages = r.messages as Record<string, unknown> | undefined;
  if (messages && Array.isArray(messages.records)) return messages.records as any[];
  if (Array.isArray(r.records)) return r.records as any[];
  if (Array.isArray(r.data)) return r.data as any[];
  return [];
}

function purgeInstanceFromLidMap(
  map: Map<string, string>,
  instancePhone: string | null,
): void {
  if (!instancePhone) return;
  for (const [k, v] of [...map]) {
    if (isInstancePhone(v, instancePhone) || isInstancePhone(k, instancePhone)) {
      map.delete(k);
      map.delete(v);
    }
  }
}

function toMs(value: unknown): number {
  const n = Number(value);
  if (!n || Number.isNaN(n)) return 0;
  return n < 10_000_000_000 ? n * 1000 : n;
}

function buildGlobalSummary(orders: Array<{ status: string }>) {
  return {
    new: orders.filter((o) => o.status === 'PENDING').length,
    pending: orders.filter((o) => ['CONFIRMED', 'IN_PROGRESS'].includes(o.status)).length,
    outForDelivery: orders.filter((o) => ['READY', 'DELIVERING'].includes(o.status)).length,
    completed: orders.filter((o) => ['DELIVERED', 'COMPLETED'].includes(o.status)).length,
  };
}
