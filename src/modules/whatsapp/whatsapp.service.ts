import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { prisma } from '../../../lib/prisma';
import ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import {
  UpdateWhatsAppConfigDto,
  SendTestMessageDto,
  FetchMessagesDto,
  SendCrmMessageDto,
} from './dto/whatsapp.dto';
import { UploadService } from '../upload/upload.service';
import { normalizeBrazilPhone } from 'src/utils/normalizePhone';
import { isGroupJid, safeMessageId } from 'src/utils/reutilizeWhatsapp';
import {
  isInstancePhone,
  isLidJid,
  isPhoneJid,
  phoneFromJid,
  pickContactJids,
  registerLidPair,
  resolveJidWithMap,
} from 'src/utils/whatsapp-jid.util';
import { buildLidMapFromEvolutionData, normalizeEvolutionList } from 'src/utils/whatsapp-lid-map';
import { pickPhoneFromLidMessages } from 'src/utils/whatsapp-lid-resolve';
import { fetchChatsForBranch } from './fetch-chats';
import { loadPersistedLidPairs, persistLidPair } from './whatsapp-lid-pair.store';

/**
 * Prefixo usado ao criar instâncias na Evolution API.
 * Deve ser idêntico ao usado em resolveBranchId() do webhook controller.
 */
const INSTANCE_PREFIX = 'anotaja_';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  /** Cache em memória LID ↔ telefone aprendido via webhook (por instância). */
  private readonly lidMapCache = new Map<string, Map<string, string>>();

  constructor(private readonly uploadService: UploadService) {}

  rememberLidPair(
    instanceName: string,
    lidJid: string,
    phoneJid: string,
    instancePhone?: string | null,
  ): void {
    if (!isLidJid(lidJid) || !isPhoneJid(phoneJid)) return;
    if (isInstancePhone(phoneJid, instancePhone)) return;

    let map = this.lidMapCache.get(instanceName);
    if (!map) {
      map = new Map();
      this.lidMapCache.set(instanceName, map);
    }
    registerLidPair(map, lidJid, phoneJid);

    void persistLidPair(instanceName, lidJid, phoneJid).catch((err) =>
      this.logger.warn(`[rememberLidPair] falha ao persistir ${lidJid}: ${err?.message}`),
    );
  }

  /** Carrega pares LID persistidos (DB + cache em memória). */
  async loadPersistedLidMap(instanceName: string): Promise<Map<string, string>> {
    const map = new Map<string, string>();

    const cached = this.lidMapCache.get(instanceName);
    if (cached) {
      for (const [k, v] of cached) map.set(k, v);
    }

    const fromDb = await loadPersistedLidPairs(instanceName);
    for (const [k, v] of fromDb) map.set(k, v);

    return map;
  }

  /** Remove do mapa pares LID → telefone que apontam para o número da própria instância. */
  private purgeInstanceFromLidMap(map: Map<string, string>, instancePhone?: string | null): void {
    if (!instancePhone) return;
    for (const [lid, phone] of [...map]) {
      if (isInstancePhone(phone, instancePhone)) {
        map.delete(lid);
        map.delete(phone);
      }
    }
  }

  /** Busca senderPn / remoteJidAlt nas mensagens do chat @lid na Evolution. */
  async resolveLidViaMessages(
    instanceName: string,
    lidJid: string,
    instancePhone?: string | null,
  ): Promise<string | null> {
    const raw = await this.evolutionRequest(
      'POST',
      `/chat/findMessages/${instanceName}`,
      { where: { key: { remoteJid: lidJid } } },
    ).catch(() => null);

    if (!raw) return null;

    const messages = this.extractMessages(raw);

    for (const m of messages) {
      if (m.key?.fromMe) continue;
      const candidate =
        m.senderPn ||
        m.remoteJidAlt ||
        m.participant ||
        m.key?.participant;
      if (candidate && isPhoneJid(candidate) && !isInstancePhone(candidate, instancePhone)) {
        return candidate;
      }
    }

    for (const m of messages) {
      const candidate = m.senderPn || m.remoteJidAlt || m.key?.participant;
      if (candidate && isPhoneJid(candidate) && !isInstancePhone(candidate, instancePhone)) {
        return candidate;
      }
    }

    return null;
  }

  // ─── Env helpers ─────────────────────────────────────────────────────────────

  private get serverUrl(): string {
    const url = process.env.EVOLUTION_API_URL;
    if (!url) throw new BadRequestException('EVOLUTION_API_URL não configurada');
    return url.replace(/\/+$/, '');
  }

  private get globalApiKey(): string {
    const key = process.env.EVOLUTION_API_KEY;
    if (!key) throw new BadRequestException('EVOLUTION_API_KEY não configurada');
    return key;
  }

  // ─── Config CRUD ──────────────────────────────────────────────────────────────

  async getConfig(branchId: string) {
    const config = await prisma.whatsAppConfig.findUnique({ where: { branchId } });

    if (!config) {
      return {
        status: 'disconnected',
        enabled: false,
        notifyNewOrder: true,
        notifyOrderStatus: true,
        notifyDelivery: true,
        orderConfirmationEnabled: true,
        orderReadyEnabled: true,
        deliveryStartEnabled: true,
        deliveryCancelEnabled: true,
      };
    }

    const { serverUrl: _s, apiKey: _a, ...safe } = config as any;
    return safe;
  }

  async updateConfig(branchId: string, dto: UpdateWhatsAppConfigDto) {
    return prisma.whatsAppConfig.upsert({
      where: { branchId },
      update: dto,
      create: { branchId, ...dto },
    });
  }

  // ─── Instance lifecycle ───────────────────────────────────────────────────────

  async setup(branchId: string) {
    const instanceName = `${INSTANCE_PREFIX}${branchId}`;

    await prisma.whatsAppConfig.upsert({
      where: { branchId },
      update: { serverUrl: this.serverUrl, apiKey: this.globalApiKey, instanceName, status: 'connecting' },
      create: { branchId, serverUrl: this.serverUrl, apiKey: this.globalApiKey, instanceName, status: 'connecting' },
    });

    // Garante instância limpa na Evolution API
    await this.evolutionRequest('DELETE', `/instance/logout/${instanceName}`).catch(() => {});
    await this.evolutionRequest('DELETE', `/instance/delete/${instanceName}`).catch(() => {});

    try {
      // Cria instância
      const webhookUrl = process.env.EVOLUTION_WEBHOOK_URL;

      const instanceName = `${INSTANCE_PREFIX}${branchId}`;

      const exists = await this.evolutionRequest(
        'GET',
        `/instance/fetchInstances`
      ).catch(() => []);

      const alreadyExists = Array.isArray(exists)
        ? exists.some(i => i.instance?.instanceName === instanceName)
        : false;

     if (!alreadyExists) {
      await this.evolutionRequest('POST', '/instance/create', {
        instanceName,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
        storeMessages: true,
        storeFullMessages: true,
        webhook: {
          url:webhookUrl,
          byEvents: false,
          base64: false,
          events: [
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
            'SEND_MESSAGE',
            'CHATS_UPSERT',
            'CONNECTION_UPDATE'
          ]
        }
      });
    }

      
      // Solicita QR code
      const connectRes = await this.evolutionRequest('GET', `/instance/connect/${instanceName}`);
      const qrCode = connectRes?.base64 ?? connectRes?.qrcode?.base64 ?? null;

      await prisma.whatsAppConfig.update({
        where: { branchId },
        data: { status: 'qr_code', qrCode },
      });

      // Monitora conexão em background
      this.monitorConnection(branchId, instanceName);

      return { status: 'qr_code', qrCode, instanceName };
    } catch (error: any) {
      this.logger.error('[Setup] Erro:', error);
      await prisma.whatsAppConfig.update({
        where: { branchId },
        data: { status: 'disconnected' },
      });
      throw new BadRequestException(error?.message ?? 'Falha ao inicializar WhatsApp');
    }
  }

  async setupPartner(partnerId: string) {
    const instanceName = `${INSTANCE_PREFIX}partner_${partnerId}`;

    await prisma.whatsAppConfig.upsert({
      where: { partnerId },
      update: { serverUrl: this.serverUrl, apiKey: this.globalApiKey, instanceName, status: 'connecting' },
      create: { partnerId, serverUrl: this.serverUrl, apiKey: this.globalApiKey, instanceName, status: 'connecting' },
    });

    // Limpa instância anterior
    await this.evolutionRequest('DELETE', `/instance/logout/${instanceName}`).catch(() => {});
    await this.evolutionRequest('DELETE', `/instance/delete/${instanceName}`).catch(() => {});

    try {
      const webhookUrl = process.env.EVOLUTION_WEBHOOK_URL;
      await this.evolutionRequest('POST', '/instance/create', {
        instanceName,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
        storeMessages: true,
        storeFullMessages: true,
        url: webhookUrl,
      });

      if (webhookUrl) {
        await this.evolutionRequest('POST', `/webhook/set/${instanceName}`, {
          url: webhookUrl,
          webhook_by_events: false,
          events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'SEND_MESSAGE', 'CONTACTS_UPDATE', 'CHATS_UPDATE', 'CHATS_UPSERT', 'PRESENCE_UPDATE'],
        }).catch(() => {});
      }

      const connectRes = await this.evolutionRequest('GET', `/instance/connect/${instanceName}`);
      const qrCode = connectRes?.base64 ?? connectRes?.qrcode?.base64 ?? null;

      await prisma.whatsAppConfig.update({
        where: { partnerId },
        data: { status: 'qr_code', qrCode },
      });

      return { status: 'qr_code', qrCode, instanceName };
    } catch (error: any) {
      this.logger.error('[SetupPartner] Erro:', error);
      await prisma.whatsAppConfig.update({ where: { partnerId }, data: { status: 'disconnected' } });
      throw new BadRequestException(error?.message ?? 'Falha ao conectar WhatsApp do parceiro');
    }
  }

  async connect(branchId?: string, partnerId?: string) {
    const where = this.configWhere(branchId, partnerId);
    const config = await prisma.whatsAppConfig.findFirst({ where });

    if (!config?.instanceName) {
      throw new BadRequestException('WhatsApp não configurado. Execute setup primeiro.');
    }

    const res = await this.evolutionRequest('GET', `/instance/connect/${config.instanceName}`);
    const qrCode = res?.base64 ?? null;
    const status = qrCode ? 'qr_code' : 'connecting';

    await prisma.whatsAppConfig.update({
      where: { id: config.id },
      data: { status, qrCode },
    });

    return { status, qrCode };
  }
  
  async disconnect(branchId?: string, partnerId?: string) {
    const where = this.configWhere(branchId, partnerId);
    const config = await prisma.whatsAppConfig.findFirst({ where });

    if (!config) throw new BadRequestException('WhatsApp não configurado.');

    await this.evolutionRequest('DELETE', `/instance/logout/${config.instanceName}`).catch(() => {});
    await this.evolutionRequest('DELETE', `/instance/delete/${config.instanceName}`).catch(() => {});

    // ← Limpa a sessão do Baileys via Evolution API
    await this.evolutionRequest('DELETE', `/instance/logout/${config.instanceName}`).catch(() => {});
    
    // Pede para a Evolution limpar o cache da instância
    await this.evolutionRequest('POST', `/instance/restart/${config.instanceName}`).catch(() => {});

    // Limpa unreads (branchId aqui é WhatsAppConfig.id, não Branch.id)
    await prisma.whatsAppChatRead.deleteMany({ where: { branchId: config.id } });

    // Limpa mensagens @lid e @g.us
    await prisma.whatsAppMessage.deleteMany({
      where: {
        ...(branchId ? { branchId } : {}),
        ...(partnerId ? { partnerId } : {}),
        OR: [
          { remoteJid: { endsWith: '@lid' } },
          { remoteJid: { endsWith: '@g.us' } },
        ],
      },
    });

    await prisma.chatLastMessage.deleteMany({
      where: {
        OR: [
          { remoteJid: { endsWith: '@lid' } },
          { remoteJid: { endsWith: '@g.us' } },
        ],
      },
    });

    await prisma.whatsAppConfig.update({
      where: { id: config.id },
      data: {
        status: 'disconnected',
        qrCode: null,
        phoneNumber: null,
        profileName: null,
        profilePicUrl: null,
      },
    });

    return { status: 'disconnected' };
  }

  async getStatus(branchId?: string, partnerId?: string) {
    const where = this.configWhere(branchId, partnerId);
    const config = await prisma.whatsAppConfig.findFirst({ where });

    if (!config?.instanceName) return { status: 'disconnected' };

    try {
      const res = await this.evolutionRequest('GET', `/instance/connectionState/${config.instanceName}`);
      const state: string = res?.instance?.state ?? res?.state ?? 'close';

      let status: string;
      if (state === 'open') {
        status = 'connected';
        if (config.status !== 'connected') {
          await prisma.whatsAppConfig.update({
            where: { id: config.id },
            data: { status: 'connected', qrCode: null },
          });
        }
      } else if (state === 'connecting') {
        status = config.qrCode ? 'qr_code' : 'connecting';
      } else {
        status = 'disconnected';
      }

      return {
        status,
        phoneNumber: config.phoneNumber,
        profileName: config.profileName,
        profilePicUrl: config.profilePicUrl,
        instanceName: config.instanceName,
        branchId: config.branchId,
      };
    } catch {
      return { status: config.status ?? 'disconnected' };
    }
  }

  // ─── Messaging ────────────────────────────────────────────────────────────────

  async sendTestMessage(branchId: string, dto: SendTestMessageDto) {
    const config = await this.requireConnectedConfig(branchId);
    const phone = this.formatPhone(dto.phone);
    const text = dto.message ?? 'Mensagem de teste do Anotaja! Sua integração WhatsApp está funcionando.';

    await this.evolutionRequest('POST', `/message/sendText/${config.instanceName}`, { number: phone, text });
    return { success: true, message: 'Mensagem de teste enviada!' };
  }

  /**
   * Envia mensagem com fallback automático de número (com/sem dígito 9).
   *
   * Estratégia:
   *   1. Verifica qual formato (+9 ou sem +9) existe no WhatsApp via API.
   *   2. Usa o número validado para enviar.
   *   3. Registra resultado no banco independente de sucesso/falha.
   */
  async sendMessage(
    phone: string,
    text: string,
    branchId?: string,
    partnerId?: string,
    customerId?: string,
    customerName?: string,
  ): Promise<{ success: boolean }> {
    const where = this.configWhere(branchId, partnerId);
    const config = await prisma.whatsAppConfig.findFirst({ where });

    if (!config || config.status !== 'connected') {
      throw new BadRequestException('WhatsApp não está conectado');
    }

    // Resolve qual número aceita mensagem
    const validPhone = await this.resolveWhatsAppNumber(config.instanceName!, phone);

    if (!validPhone) {
      await this.recordMessage({ branchId, partnerId, customerId, customerName, phone: this.formatPhone(phone), text, status: 'failed' });
      throw new BadRequestException(`Número ${phone} não possui WhatsApp`);
    }

    try {
      await this.evolutionRequest('POST', `/message/sendText/${config.instanceName}`, { number: validPhone, text });
      await this.recordMessage({ branchId, partnerId, customerId, customerName, phone: validPhone, text, status: 'sent' });
      return { success: true };
    } catch (error: any) {
      await this.recordMessage({ branchId, partnerId, customerId, customerName, phone: validPhone, text, status: 'failed' });
      this.logger.error(`[sendMessage] Falha ao enviar para ${validPhone}:`, error);
      throw new BadRequestException(`Falha ao enviar mensagem para ${phone}`);
    }
  }

  async sendBulkMessages(
    recipients: Array<{ phone: string; name?: string; segment?: string; customerId?: string }>,
    message: string,
    branchId?: string,
    partnerId?: string,
  ) {
    const results = { success: 0, failed: 0, errors: [] as string[] };

    let partnerCode: string | null = null;
    if (partnerId) {
      const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { code: true } });
      partnerCode = partner?.code ?? null;
    }

    const frontendUrl = process.env.FRONTEND_URL ?? 'https://app.vaidelli.com';

    for (const { phone, name, segment, customerId } of recipients) {
      try {
        let personalized = message;
        if (name) personalized = personalized.replace(/{nome}/g, name);
        if (segment) personalized = personalized.replace(/{segmento}/g, segment);
        personalized = personalized.replace(/{telefone}/g, phone);
        personalized = personalized.replace(
          /{register-company}/g,
          partnerCode ? `${frontendUrl}/register-company?partner=${partnerCode}` : `${frontendUrl}/register-company`,
        );
        personalized = personalized.replace(/{admin-login}/g, `${frontendUrl}/admin/login`);
        personalized = personalized.replace(/{loja}/g, frontendUrl);

        await this.sendMessage(phone, personalized, branchId, partnerId, customerId, name);
        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push(`${phone}: ${err}`);
      }
    }

    return results;
  }

  // ─── LID resolution ───────────────────────────────────────────────────────────

  /**
   * Mapa bidirecional @lid ↔ @s.whatsapp.net (contatos + mensagens recentes).
   */
  async buildLidMap(
    instanceName: string,
    rawChats: any[] = [],
    instancePhone?: string | null,
  ): Promise<Map<string, string>> {
    const contacts = await this.evolutionRequest(
      'POST',
      `/chat/findContacts/${instanceName}`,
      { where: {}, limit: 2000 },
    )
      .then((r) => normalizeEvolutionList(r))
      .catch(() => [] as any[]);

    const messages = await this.evolutionRequest(
      'POST',
      `/chat/findMessages/${instanceName}`,
      { where: {}, limit: 200 },
    )
      .then((r) => this.extractMessages(r))
      .catch(() => [] as any[]);

    const map = buildLidMapFromEvolutionData(contacts, messages, rawChats);

    const persisted = await this.loadPersistedLidMap(instanceName);
    for (const [k, v] of persisted) map.set(k, v);

    this.purgeInstanceFromLidMap(map, instancePhone);

    this.logger.debug(`[buildLidMap] ${map.size / 2} pares LID mapeados`);
    return map;
  }

  /**
   * Resolve JID de contato a partir do webhook (campos diretos + mapa Evolution).
   */
  async resolveContactJid(
    instanceName: string,
    key: any,
    data: any,
    instancePhone?: string | null,
  ): Promise<string | null> {
    const { phoneJid, lidJid, rawJid } = pickContactJids(key, data, []);
    if (!rawJid || rawJid === 'status@broadcast' || isGroupJid(rawJid)) return null;

    const safePhone =
      phoneJid && !isInstancePhone(phoneJid, instancePhone) ? phoneJid : null;

    if (safePhone && lidJid) {
      this.rememberLidPair(instanceName, lidJid, safePhone, instancePhone);
      return safePhone;
    }

    if (safePhone) return safePhone;

    if (lidJid) {
      const persisted = await this.loadPersistedLidMap(instanceName);
      const fromPersisted = persisted.get(lidJid);
      if (
        fromPersisted &&
        isPhoneJid(fromPersisted) &&
        !isInstancePhone(fromPersisted, instancePhone)
      ) {
        return fromPersisted;
      }

      const map = await this.buildLidMap(instanceName, [], instancePhone);
      const resolved = resolveJidWithMap(lidJid, map);
      if (isPhoneJid(resolved) && !isInstancePhone(resolved, instancePhone)) {
        return resolved;
      }

      const fromMessages = await this.resolveLidViaMessages(
        instanceName,
        lidJid,
        instancePhone,
      );
      if (fromMessages) {
        this.rememberLidPair(instanceName, lidJid, fromMessages, instancePhone);
        return fromMessages;
      }

      return lidJid;
    }

    if (isInstancePhone(rawJid, instancePhone)) return null;
    return rawJid;
  }

  /**
   * Todos os JIDs que representam o mesmo chat (telefone + @lid).
   * Usado para manter ChatLastMessage sincronizado em ambos os lados.
   */
  async collectSyncJids(
    instanceName: string,
    canonicalJid: string,
    key: any,
    data: any,
    instancePhone?: string | null,
  ): Promise<string[]> {
    const set = new Set<string>();
    const add = (j?: string | null) => {
      if (j && typeof j === 'string' && !isGroupJid(j) && j !== 'status@broadcast') {
        set.add(j);
      }
    };

    add(canonicalJid);
    add(key?.remoteJid);
    add(data?.remoteJid);
    add(data?.remoteJidAlt);

    const map = await this.buildLidMap(instanceName, [], instancePhone);
    for (const jid of [...set]) {
      add(map.get(jid));
      add(resolveJidWithMap(jid, map));
    }

    return [...set];
  }

  /** Todos os JIDs equivalentes (telefone + @lid) para buscar mensagens. */
  async relatedJids(
    instanceName: string,
    jid: string,
    instancePhone?: string | null,
  ): Promise<string[]> {
    const set = new Set<string>([jid]);
    const map = await this.buildLidMap(instanceName, [], instancePhone);
    const alt = map.get(jid);
    if (alt) set.add(alt);
    if (isLidJid(jid)) {
      const phone = map.get(jid);
      if (phone && isPhoneJid(phone)) set.add(phone);
    } else if (isPhoneJid(jid)) {
      const lid = map.get(jid);
      if (lid && isLidJid(lid)) set.add(lid);
    }
    return [...set];
  }

  // ─── CRM ─────────────────────────────────────────────────────────────────────

  async fetchChats(branchId: string) {
    const config = await this.requireFullConfig(branchId);

    return fetchChatsForBranch({
      instanceName: config.instanceName!,
      instancePhone: config.phoneNumber,
      instanceProfileName: config.profileName,
      branchId,
      configId: config.id,
      evolutionRequest: (method, path, body) => this.evolutionRequest(method, path, body),
      loadPersistedLidMap: (inst) => this.loadPersistedLidMap(inst),
      resolveLidViaMessages: (inst, lid, phone) =>
        this.resolveLidViaMessages(inst, lid, phone),
      rememberLidPair: (inst, lid, phoneJid, phone) =>
        this.rememberLidPair(inst, lid, phoneJid, phone),
      summarizeOrders: (orders) => this.summarizeOrders(orders),
      logger: this.logger,
    });
  }

  

async fetchMessages(branchId: string, dto: FetchMessagesDto) {
  const { jid } = dto;

  // ❌ bloqueia grupo imediatamente
  if (!jid || isGroupJid(jid)) {
    return [];
  }

  // 🔧 config
  const config = await prisma.whatsAppConfig.findUnique({
    where: { branchId },
  });

  if (!config?.instanceName) {
    return [];
  }

  const jidsToFetch = await this.relatedJids(
    config.instanceName,
    jid,
    config.phoneNumber,
  );

  // 📡 busca mensagens em todos os JIDs equivalentes (telefone + @lid)
  const allRaw: any[] = [];
  for (const targetJid of jidsToFetch) {
    const raw = await this.evolutionRequest(
      'POST',
      `/chat/findMessages/${config.instanceName}`,
      {
        where: {
          key: {
            remoteJid: targetJid,
          },
        },
      },
    ).catch(() => null);
    if (raw) allRaw.push(...this.extractMessages(raw));
  }

  // Mensagens salvas localmente pelo webhook (inclui as que a Evolution não indexou ainda)
  const localRows = await prisma.whatsAppMessage.findMany({
    where: {
      branchId,
      remoteJid: { in: jidsToFetch },
    },
    orderBy: { sentAt: 'desc' },
    take: 200,
  });

  const messages = [
    ...allRaw,
    ...localRows.map((row) => ({
      key: { id: row.id, remoteJid: row.remoteJid, fromMe: row.fromMe },
      message: { conversation: row.text || row.message },
      messageTimestamp: Math.floor(row.sentAt.getTime() / 1000),
      pushName: row.pushName,
      status: row.status,
    })),
  ];

  // 🧹 limpeza + deduplicação
  const seen = new Set<string>();

  const cleaned = messages
    .filter((msg: any) => {
      if (!msg) return false;
      if (isGroupJid(msg?.key?.remoteJid)) return false;

      const id = safeMessageId(msg);
      if (!id) return false;

      if (seen.has(id)) return false;
      seen.add(id);

      return true;
    })
    .sort((a: any, b: any) => {
      return Number(b?.messageTimestamp ?? 0) -
             Number(a?.messageTimestamp ?? 0);
    });

  // 📦 normalize final
  const normalized = cleaned.map((msg: any) => ({
    id: safeMessageId(msg),
    fromMe: msg?.key?.fromMe ?? false,
    text: this.extractText(msg) ?? '',
    timestamp: this.toMs(msg?.messageTimestamp),
    status: this.mapStatus(msg?.status),
    mediaType: this.detectMediaType(msg),
    mediaUrl: this.extractMediaUrl(msg),
    pushName: msg?.pushName ?? null,
  }));

  return normalized;
}

  async sendCrmMessage(branchId: string, dto: SendCrmMessageDto) {
    const config = await this.requireConnectedConfig(branchId);

    const result = await this.evolutionRequest(
      'POST',
      `/message/sendText/${config.instanceName}`,
      { number: dto.jid, text: dto.text },
    );

    return { success: true, messageId: result?.key?.id ?? null };
  }

  async sendCrmMedia(branchId: string, jid: string, file: Express.Multer.File, caption?: string) {
    const config = await this.requireConnectedConfig(branchId);
    const isAudio = file.mimetype.startsWith('audio/');
    const base64 = file.buffer.toString('base64');

    const endpoint = isAudio
      ? `/message/sendWhatsAppAudio/${config.instanceName}`
      : `/message/sendMedia/${config.instanceName}`;

    const body = isAudio
      ? { number: jid, audio: base64, encoding: true }
      : {
          number: jid,
          mediatype: this.mimeToMediaType(file.mimetype),
          media: base64,
          fileName: file.originalname,
          caption: caption ?? '',
        };

    const result = await this.evolutionRequest('POST', endpoint, body);
    return { success: true, messageId: result?.key?.id ?? result?.messageId ?? null };
  }

  async updateMessageStatus(messageId: string, status: string): Promise<void> {
    try {
      await prisma.whatsAppMessage.updateMany({
        where: { id: messageId },
        data: { status },
      });
    } catch {
      // mensagem pode não existir ainda no banco local
    }
  }

  async markChatAsRead(branchId?: string, partnerId?: string, jid?: string) {
    if (!branchId || !jid) return { success: true };

    try {
      const config = await prisma.whatsAppConfig.findUnique({ where: { branchId } });
      if (!config?.instanceName) return { success: true };

      const syncJids = await this.collectSyncJids(config.instanceName, jid, { remoteJid: jid }, {});

      for (const targetJid of syncJids) {
        await prisma.whatsAppChatRead.upsert({
          where: { branchId_jid: { branchId: config.id, jid: targetJid } },
          create: {
            branchId: config.id,
            jid: targetJid,
            unreadCount: 0,
            lastReadAt: new Date(),
          },
          update: { unreadCount: 0, lastReadAt: new Date() },
        });
      }

      await this.evolutionRequest(
        'POST',
        `/chat/markMessageAsRead/${config.instanceName}`,
        { readMessages: [{ remoteJid: jid, fromMe: false }] },
      ).catch(() =>
        this.evolutionRequest('POST', `/chat/readMessages/${config.instanceName}`, {
          readMessages: [{ remoteJid: jid }],
        }),
      );
    } catch (err) {
      this.logger.warn('[markChatAsRead] Falhou silenciosamente:', err);
    }

    return { success: true, unreadCount: 0 };
  }

  async markChatAsUnread(branchId?: string, partnerId?: string, jid?: string) {
    if (!branchId || !jid) return { success: true };

    const config = await prisma.whatsAppConfig.findUnique({ where: { branchId } });
    if (!config?.instanceName) return { success: true };

    const syncJids = await this.collectSyncJids(config.instanceName, jid, { remoteJid: jid }, {});
    let unreadCount = 1;

    for (const targetJid of syncJids) {
      const row = await prisma.whatsAppChatRead.upsert({
        where: { branchId_jid: { branchId: config.id, jid: targetJid } },
        create: { branchId: config.id, jid: targetJid, unreadCount: 1 },
        update: { unreadCount: { increment: 1 } },
      });
      unreadCount = row.unreadCount;
    }

    return { success: true, unreadCount };
  }

  // ─── Audio processing ─────────────────────────────────────────────────────────

  async processWhatsAppAudio(url: string): Promise<string> {
    this.logger.log(`[Audio] Processando: ${url}`);

    const buffer = await fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Download falhou: ${r.statusText}`);
        return r.arrayBuffer();
      })
      .then((ab) => Buffer.from(ab));

    const inputPath = path.join('/tmp', `${randomUUID()}.enc`);
    const outputPath = path.join('/tmp', `${randomUUID()}.mp3`);
    fs.writeFileSync(inputPath, buffer);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .output(outputPath)
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .on('end', () => resolve())
        .on('error', reject)
        .run();
    });

    const converted = fs.readFileSync(outputPath);
    fs.unlinkSync(inputPath);
    fs.unlinkSync(outputPath);

    const file: Express.Multer.File = {
      buffer: converted,
      originalname: 'audio.mp3',
      mimetype: 'audio/mpeg',
      size: converted.length,
      fieldname: 'audio',
      encoding: '7bit',
      stream: null as any,
      destination: '',
      filename: '',
      path: '',
    };

    const r2Url = await this.uploadService.uploadFile(file, 'whatsapp-audio');
    this.logger.log(`[Audio] Upload concluído: ${r2Url}`);
    return r2Url;
  }

  // ─── Templates e Campanhas ────────────────────────────────────────────────────

  async getTemplates(branchId?: string, partnerId?: string) {
    const where = this.configWhere(branchId, partnerId);
    if (!Object.keys(where).length) return [];
    return prisma.messageTemplate.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async createTemplate(dto: { name: string; content: string; category?: string }, branchId?: string, partnerId?: string) {
    const where = this.configWhere(branchId, partnerId);
    return prisma.messageTemplate.create({ data: { ...dto, ...where } });
  }

  async updateTemplate(id: string, dto: { name?: string; content?: string; category?: string }) {
    return prisma.messageTemplate.update({ where: { id }, data: dto });
  }

  async deleteTemplate(id: string) {
    return prisma.messageTemplate.delete({ where: { id } });
  }

  async getCampaigns(branchId?: string, partnerId?: string) {
    const where = this.configWhere(branchId, partnerId);
    if (!Object.keys(where).length) return [];
    return prisma.campaignRecord.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async createCampaign(
    dto: { name: string; message: string; recipients: number; sent: number; failed: number; status?: string; scheduledAt?: string },
    branchId?: string,
    partnerId?: string,
  ) {
    const where = this.configWhere(branchId, partnerId);
    return prisma.campaignRecord.create({ data: { ...dto, ...where } });
  }

  // ─── Outros helpers públicos ──────────────────────────────────────────────────

  async getMessageHistoryByPhone(phone: string, partnerId?: string, branchId?: string) {
    return prisma.whatsAppMessage.findMany({
      where: { customerPhone: this.formatPhone(phone), partnerId, branchId },
      orderBy: { sentAt: 'desc' },
      take: 50,
    });
  }

  async checkDuplicateMessage(phone: string, message: string, partnerId?: string, branchId?: string) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dup = await prisma.whatsAppMessage.findFirst({
      where: {
        customerPhone: this.formatPhone(phone),
        message,
        partnerId,
        branchId,
        status: 'sent',
        sentAt: { gte: oneDayAgo },
      },
    });
    return !!dup;
  }

  async registerWebhook(branchId: string, webhookUrl: string) {
    const config = await this.requireFullConfig(branchId);
    return this.evolutionRequest('POST', `/webhook/set/${config.instanceName}`, {
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: false,
        events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'SEND_MESSAGE', 'PRESENCE_UPDATE', 'CHATS_UPDATE'],
      },
    });
  }

  async getFullConfigPublic(branchId: string) {
    return prisma.whatsAppConfig.findUnique({ where: { branchId } });
  }

  // ─── Privados ─────────────────────────────────────────────────────────────────

  private async requireConnectedConfig(branchId: string) {
    const config = await prisma.whatsAppConfig.findUnique({ where: { branchId } });
    if (!config?.instanceName) throw new BadRequestException('WhatsApp não configurado. Conecte o WhatsApp primeiro.');
    if (config.status !== 'connected') throw new BadRequestException('WhatsApp não está conectado.');
    return config;
  }

  private async requireFullConfig(branchId: string) {
    const config = await prisma.whatsAppConfig.findUnique({ where: { branchId } });
    if (!config?.instanceName) throw new BadRequestException('WhatsApp não configurado. Conecte o WhatsApp primeiro.');
    return config;
  }

  private configWhere(branchId?: string, partnerId?: string) {
    if (partnerId) return { partnerId };
    if (branchId) return { branchId };
    return {};
  }

  /** Monitora a conexão da instância em background após setup. */
  private monitorConnection(branchId: string, instanceName: string, maxAttempts = 60) {
    let attempts = 0;

    const check = async () => {
      if (attempts >= maxAttempts) return;
      attempts++;

      try {
        const status = await this.getStatus(branchId);
        if (status.status === 'connected') {
          await this.fetchChats(branchId).catch(() => {});
          return;
        }
        setTimeout(check, 10_000);
      } catch {
        setTimeout(check, 10_000);
      }
    };

    setTimeout(check, 5_000);
  }

  // ─── Phone helpers ────────────────────────────────────────────────────────────

  /**
   * Formata número para E.164 brasileiro (sem remover o 9 extra).
   * O fallback com/sem 9 é resolvido via checkWhatsAppNumber.
   */
  private formatPhone(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('55') && cleaned.length >= 12) return cleaned;
    return `55${cleaned}`;
  }

  /**
   * Gera variante alternativa: com 9 ↔ sem 9 após o DDD.
   */
  private formatPhoneAlternative(formatted: string): string | null {
    const local = formatted.startsWith('55') ? formatted.slice(2) : formatted;
    if (local.length === 11 && local[2] === '9') return `55${local.slice(0, 2)}${local.slice(3)}`;
    if (local.length === 10) return `55${local.slice(0, 2)}9${local.slice(2)}`;
    return null;
  }

  /**
   * Verifica quais números existem no WhatsApp e retorna o primeiro válido.
   * Tenta o número principal; se não existir, tenta a variante.
   */
  private async resolveWhatsAppNumber(instanceName: string, phone: string): Promise<string | null> {
    const primary = this.formatPhone(phone);
    const alternative = this.formatPhoneAlternative(primary);

    if (await this.checkWhatsAppNumber(instanceName, primary)) return primary;
    if (alternative && await this.checkWhatsAppNumber(instanceName, alternative)) return alternative;

    return null;
  }

  private async checkWhatsAppNumber(instanceName: string, phone: string): Promise<boolean> {
    try {
      const res = await this.evolutionRequest('POST', `/chat/whatsappNumbers/${instanceName}`, { numbers: [phone] });
      const result = Array.isArray(res) ? res[0] : res?.[0];
      return !!result?.exists;
    } catch {
      return true; // em caso de falha na API, tenta enviar mesmo assim
    }
  }

  // ─── Mensagens (db) ───────────────────────────────────────────────────────────

  private async recordMessage(params: {
    branchId?: string;
    partnerId?: string;
    customerId?: string;
    customerName?: string;
    phone: string;
    text: string;
    status: string;
  }) {
    try {
      await prisma.whatsAppMessage.create({
        data: {
          branchId: params.branchId,
          partnerId: params.partnerId,
          customerId: params.customerId,
          customerName: params.customerName,
          customerPhone: params.phone,
          message: params.text,
          text: params.text,
          status: params.status,
          fromMe: true,
          sentAt: new Date(),
          remoteJid: `${params.phone}@s.whatsapp.net`,
        },
      });
    } catch (err) {
      this.logger.error('[recordMessage] Falha ao salvar mensagem:', err);
    }
  }

  // ─── Formatação ───────────────────────────────────────────────────────────────

  private summarizeOrders(orders: any[]) {
    return {
      new: orders.filter((o) => o.status === 'PENDING').length,
      pending: orders.filter((o) => o.status === 'CONFIRMED' || o.status === 'IN_PROGRESS').length,
      outForDelivery: orders.filter((o) => o.status === 'READY' || o.status === 'DELIVERING').length,
      completed: orders.filter((o) => o.status === 'DELIVERED' || o.status === 'COMPLETED').length,
    };
  }

  private extractMessages(result: any): any[] {
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.messages)) return result.messages;
    if (Array.isArray(result?.messages?.records)) return result.messages.records;
    if (Array.isArray(result?.records)) return result.records;
    if (Array.isArray(result?.data)) return result.data;
    return [];
  }

  private extractText(msg: any): string {
    if (!msg) return '';
    const m = msg.message ?? msg;
    return (
      m.conversation ||
      m.extendedTextMessage?.text ||
      m.imageMessage?.caption ||
      m.videoMessage?.caption ||
      m.documentMessage?.caption ||
      m.documentMessage?.title ||
      m.audioMessage?.caption ||
      m.contactMessage?.displayName ||
      m.locationMessage?.name ||
      m.buttonsResponseMessage?.selectedDisplayText ||
      m.listResponseMessage?.description ||
      ''
    );
  }

  private detectMediaType(msg: any): string {
    const m = msg?.message ?? msg ?? {};
    if (m.imageMessage) return 'image';
    if (m.videoMessage) return 'video';
    if (m.audioMessage) return 'audio';
    if (m.documentMessage) return 'document';
    if (m.stickerMessage) return 'sticker';
    if (m.locationMessage) return 'location';
    if (m.contactMessage) return 'contact';
    return 'text';
  }

  private extractMediaUrl(msg: any): string | null {
    const m = msg?.message ?? msg ?? {};
    return m.imageMessage?.url ?? m.videoMessage?.url ?? m.audioMessage?.url ?? m.documentMessage?.url ?? null;
  }

  private toMs(ts: any): number {
    if (!ts) return Date.now();
    const n = Number(ts);
    if (isNaN(n) || n <= 0) return Date.now();
    return n < 10_000_000_000 ? n * 1000 : n;
  }

  private mapStatus(status?: number | string): string {
    if (typeof status === 'number') {
      return ({ 0: 'error', 1: 'pending', 2: 'sent', 3: 'received', 4: 'read', 5: 'read' } as any)[status] ?? 'sent';
    }
    switch (String(status ?? '').toUpperCase()) {
      case 'ERROR':        return 'error';
      case 'PENDING':      return 'pending';
      case 'SERVER_ACK':   return 'sent';
      case 'DELIVERY_ACK': return 'received';
      case 'READ':
      case 'PLAYED':       return 'read';
      default:             return 'sent';
    }
  }

  private mimeToMediaType(mime: string): string {
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    return 'document';
  }

  // ─── Evolution API HTTP ───────────────────────────────────────────────────────

  private async evolutionRequest(method: string, urlPath: string, body?: any): Promise<any> {
    const url = `${this.serverUrl}${urlPath}`;

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', apikey: this.globalApiKey },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      const err: any = new Error(`Evolution API error (${res.status}): ${text}`);
      err.status = res.status;
      throw err;
    }

    return res.json();
  }
}