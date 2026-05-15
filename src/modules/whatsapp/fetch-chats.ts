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
} from 'src/utils/whatsapp-jid.util';
import { buildLidMapFromEvolutionData, normalizeEvolutionList } from 'src/utils/whatsapp-lid-map';

/** Chat agregado internamente — sempre indexado por JID de telefone. */
interface AggregatedChat {
  remoteJid: string;
  lidJid?: string;
  pushName: string | null;
  profilePicUrl: string | null;
  updatedAtMs: number;
}

export interface FetchChatsResult {
  chats: Array<{
    id: string;
    jid: string;
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
  branchId: string;
  configId: string;
  evolutionRequest: (method: string, path: string, body?: unknown) => Promise<unknown>;
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
  const raw = phoneFromJid(jid);
  const normalized = normalizeBrazilPhone(raw);
  if (normalized) return normalized.slice(2);
  return raw.startsWith('55') ? raw.slice(2) : raw;
}

function pickNewerChat(current: AggregatedChat, incoming: AggregatedChat): AggregatedChat {
  if (incoming.updatedAtMs >= current.updatedAtMs) {
    return {
      ...incoming,
      lidJid: incoming.lidJid ?? current.lidJid,
      pushName: incoming.pushName ?? current.pushName,
      profilePicUrl: incoming.profilePicUrl ?? current.profilePicUrl,
    };
  }
  return {
    ...current,
    lidJid: current.lidJid ?? incoming.lidJid,
    pushName: current.pushName ?? incoming.pushName,
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
    branchId,
    configId,
    evolutionRequest,
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
  purgeInstanceFromLidMap(lidMap, instancePhone);

  logger?.log(`[fetchChats] evolution=${rawChats.length} lidPairs=${lidMap.size / 2}`);

  // ── 2. Resolver JID → telefone ─────────────────────────────────────────
  const resolveToPhone = async (
    rawJid: string,
  ): Promise<{ phoneJid: string; lidJid?: string } | null> => {
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

    if (!phoneJid || !isPhoneJid(phoneJid) || isInstancePhone(phoneJid, instancePhone)) {
      return null;
    }

    let lidJid = lidFromRaw;
    if (!lidJid) {
      const alt = lidMap.get(phoneJid);
      if (alt && isLidJid(alt)) lidJid = alt;
    }

    return { phoneJid, lidJid };
  };

  // ── 3. Agregar por telefone (deduplica @lid + telefone) ────────────────
  const aggregated = new Map<string, AggregatedChat>();

  const upsert = (resolved: { phoneJid: string; lidJid?: string }, meta: Partial<AggregatedChat>) => {
    const incoming: AggregatedChat = {
      remoteJid: resolved.phoneJid,
      lidJid: resolved.lidJid,
      pushName: meta.pushName ?? null,
      profilePicUrl: meta.profilePicUrl ?? null,
      updatedAtMs: meta.updatedAtMs ?? 0,
    };

    const existing = aggregated.get(resolved.phoneJid);
    aggregated.set(
      resolved.phoneJid,
      existing ? pickNewerChat(existing, incoming) : incoming,
    );
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

  const localLastRows = await prisma.chatLastMessage.findMany({
    where: { branchId },
    orderBy: { timestamp: 'desc' },
  });

  for (const row of localLastRows) {
    const resolved = await resolveToPhone(row.remoteJid);
    if (!resolved) continue;

    upsert(resolved, {
      pushName: row.pushName,
      updatedAtMs: Number(row.timestamp),
    });
  }

  const chatList = [...aggregated.values()];
  logger?.log(`[fetchChats] conversas únicas=${chatList.length}`);

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

  for (const c of chatList) {
    const local = jidToLocalPhone(c.remoteJid);
    phoneToLocal.set(c.remoteJid, local);
    for (const v of phoneVariants(local)) {
      allVariants.add(v);
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

  const resolveCustomer = (phoneJid: string) => {
    const local = phoneToLocal.get(phoneJid) ?? jidToLocalPhone(phoneJid);
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
    const phone = phoneToLocal.get(c.remoteJid) ?? jidToLocalPhone(c.remoteJid);
    const customer = resolveCustomer(c.remoteJid);
    const last = pickLast(c.remoteJid, c.lidJid);
    const customerOrders = customer ? ordersByCustomer.get(customer.id) ?? [] : [];
    const displayName = customer?.name ?? c.pushName ?? phone;

    const lastMsgTimestamp = last ? Number(last.timestamp) : 0;

    return {
      id: c.remoteJid,
      jid: c.remoteJid,
      remoteJid: c.remoteJid,
      phone,
      name: displayName,
      pushName: c.pushName,
      profilePicUrl: c.profilePicUrl,
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
