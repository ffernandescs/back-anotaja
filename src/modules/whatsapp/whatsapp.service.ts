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
import { AiService } from '../ai/ai.service';
import { normalizeBrazilPhone } from 'src/utils/normalizePhone';
import { isGroupJid, safeMessageId } from 'src/utils/reutilizeWhatsapp';
import {
  isInstancePhone,
  isLidJid,
  isPhoneJid,
  phoneFromJid,
  phonesMatch,
  pickContactJids,
  registerLidPair,
  resolveJidWithMap,
} from 'src/utils/whatsapp-jid.util';
import { buildLidMapFromEvolutionData, normalizeEvolutionList } from 'src/utils/whatsapp-lid-map';
import { pickPhoneForLidDeepScan } from 'src/utils/whatsapp-lid-resolve';
import { fetchChatsForBranch } from './fetch-chats';
import { loadPersistedLidPairs, persistLidPair } from './whatsapp-lid-pair.store';
import { substituteCrmBootTokens } from 'src/utils/whatsapp-crm-boot-template';
import {
  buildBranchOpeningHoursBlockPt,
  buildBranchOpenStatusLinePt,
  getNowInSaoPaulo,
  isBranchEffectivelyClosedForContactNow,
  type BranchScheduleLike,
} from '../../utils/branch-schedule-for-chatbot';
import { buildBranchStorefrontPublicUrl } from 'src/utils/storefront-url';

/**
 * Prefixo usado ao criar instâncias na Evolution API.
 * Deve ser idêntico ao usado em resolveBranchId() do webhook controller.
 */
const INSTANCE_PREFIX = 'anotaja_';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  /**
   * Novas configs / INSERT: fluxos conhecidos com `useDefaultTemplate` true; `greeting.segments` vazio até edição — fallback no envío de saudação alinha ao modelo padrão.
   */
  private static blankCrmBootGreetingFlows(): Record<string, unknown> {
    return {
      greeting: {
        enabled: true,
        useDefaultTemplate: true,
        segments: [],
      },
      operatingStatus: {
        enabled: true,
        useDefaultTemplate: true,
        segments: [],
      },
      businessHours: {
        enabled: true,
        useDefaultTemplate: true,
        segments: [],
      },
    };
  }

  /**
   * Janela mínima (ms) entre duas mensagens inbound do mesmo contato para repetir saudação.
   * `CRM_BOOT_GREETING_REPEAT_AFTER_HOURS`: horas (decimal ok); **default 24**. Ex.: `0.5` → 30 min (mín. 60s).
   * `0`, `first-only` ou `first_only` → **só a primeira inbound** registada por contato+fila (comportamento legado).
   */
  private static parseCrmBootGreetingRepeatAfterHours(): number | 'first_only' {
    const raw = (process.env.CRM_BOOT_GREETING_REPEAT_AFTER_HOURS ?? '24').trim();
    const compact = raw.toLowerCase().replace(/[\s-]+/g, '_');
    if (compact === '0' || compact === 'first_only') return 'first_only';

    const h = Number.parseFloat(raw.replace(',', '.'));
    if (!Number.isFinite(h) || h < 0) return 24 * 60 * 60 * 1000;

    const ms = Math.round(h * 60 * 60 * 1000);
    return Math.max(ms, 60_000);
  }

  /**
   * Fallback quando `crmBootGreetingFlows` é `null`/vazio na filial —
   * mantém mesmo texto-base que `defaultGreetingSegments()` no front (`anotaja`).
   */
  private static defaultCrmBootGreetingFallbackSegments(): Array<{ body: string; orderIndex: number }> {
    return [
      {
        orderIndex: 1,
        body:
          '{{saudacao_horario}}, {{nome_cliente}}!\nSomos felizes em ter você aqui. Para pedir acesse {{link_pedidos}} — também podemos tirar suas dúvidas por aqui.',
      },
    ];
  }

  private static defaultCrmBootOperatingStatusFallbackSegments(): Array<{ body: string; orderIndex: number }> {
    return [
      {
        orderIndex: 1,
        body:
          'No momento não estamos em horário de atendimento pelo WhatsApp.\nVocê pode fazer seu pedido pelo cardápio: {{link_pedidos}}\nRespondemos assim que voltarmos. Obrigado!',
      },
    ];
  }

  private static defaultCrmBootBusinessHoursFallbackSegments(): Array<{ body: string; orderIndex: number }> {
    return [
      {
        orderIndex: 1,
        body:
          '{{saudacao_horario}}, {{nome_cliente}}!\n\n{{status_horario_filial}}\n\n{{horarios_filial}}\n\nPedidos: {{link_pedidos}}',
      },
    ];
  }

  private static bootFlowFallbackBodies(
    flowKey: 'greeting' | 'operatingStatus' | 'businessHours',
  ): Array<{ body: string; orderIndex: number }> {
    if (flowKey === 'greeting') return WhatsAppService.defaultCrmBootGreetingFallbackSegments();
    if (flowKey === 'operatingStatus') return WhatsAppService.defaultCrmBootOperatingStatusFallbackSegments();
    return WhatsAppService.defaultCrmBootBusinessHoursFallbackSegments();
  }

  /** `greeting.enabled === false` em `crmBootGreetingFlows` bloqueia só o fluxo de saudação. */
  private static isBootGreetingFlowDisabled(flows: unknown): boolean {
    if (flows === null || flows === undefined) return false;
    if (typeof flows !== 'object' || Array.isArray(flows)) return false;
    const g = (flows as Record<string, unknown>)['greeting'];
    if (!g || typeof g !== 'object' || Array.isArray(g)) return false;
    return (g as Record<string, unknown>)['enabled'] === false;
  }

  /** Cache em memória LID ↔ telefone aprendido via webhook (por instância). */
  private readonly lidMapCache = new Map<string, Map<string, string>>();

  /** cooldown por branch + JID de envio + fluxo (`businessHours`). */
  private readonly crmAiReactiveSentAt = new Map<string, number>();

  /** Auto mensagem „fechado“: permite enviar após loja estar em expediente de novo desde o último envio. Ausência ⇒ `true`. */
  private readonly crmClosedOperatingArmed = new Map<string, boolean>();

  constructor(
    private readonly uploadService: UploadService,
    private readonly aiService: AiService,
  ) {}

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
      {
        where: { key: { remoteJid: lidJid } },
        limit: 120,
      },
    ).catch(() => null);

    if (!raw) return null;

    const messages = this.extractMessages(raw);

    const fromDeep = pickPhoneForLidDeepScan(messages, lidJid, instancePhone);
    if (fromDeep) return fromDeep;

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
        crmBootBotEnabled: false,
        crmBootGreetingFlows: WhatsAppService.blankCrmBootGreetingFlows(),
      };
    }

    const { serverUrl: _s, apiKey: _a, ...safe } = config as any;
    return safe;
  }

  async updateConfig(branchId: string, dto: UpdateWhatsAppConfigDto) {
    const rawDto = dto as unknown as Record<string, unknown>;
    const { crmBootGreetingFlows: rawFlows, ...rest } = rawDto;

    const data: Record<string, unknown> = { ...rest };
    if ('crmBootGreetingFlows' in rawDto) {
      data.crmBootGreetingFlows = this.sanitizeBootGreetingFlows(rawFlows as unknown);
    }

    return prisma.whatsAppConfig.upsert({
      where: { branchId },
      update: data as any,
      create: { branchId, ...(data as any) },
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

  /**
   * Ao desconectar: apaga histórico CRM, última bolha por chat, não lidas e mapeamento @lid
   * desta conta (filial e/ou parceiro), mantendo o registro em `whatsapp_configs`.
   */
  private async purgeWhatsAppSessionDataFromDatabase(opts: {
    configId: string;
    branchId: string | null;
    partnerId: string | null;
    instanceName: string | null | undefined;
  }): Promise<void> {
    const { configId, branchId, partnerId, instanceName } = opts;

    await prisma.whatsAppChatRead.deleteMany({ where: { branchId: configId } });

    const messageOr: Array<{ branchId?: string; partnerId?: string }> = [];
    if (branchId) messageOr.push({ branchId });
    if (partnerId) messageOr.push({ partnerId });
    if (messageOr.length > 0) {
      await prisma.whatsAppMessage.deleteMany({ where: { OR: messageOr } });
    }

    if (branchId) {
      await prisma.chatLastMessage.deleteMany({ where: { branchId } });
    }

    if (instanceName) {
      await prisma.whatsAppLidPair.deleteMany({ where: { instanceName } });
    }
  }

  /** Throttles em memória CRM usam chave `branchId:…` (id da filial Prisma). */
  private purgeInboundCrmThrottleMapsForBranch(branchId: string | null | undefined): void {
    if (!branchId) return;
    const prefix = `${branchId}:`;
    for (const key of [...this.crmAiReactiveSentAt.keys()]) {
      if (key.startsWith(prefix)) this.crmAiReactiveSentAt.delete(key);
    }
    for (const key of [...this.crmClosedOperatingArmed.keys()]) {
      if (key.startsWith(prefix)) this.crmClosedOperatingArmed.delete(key);
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

    const inst = config.instanceName;
    if (inst) {
      await this.evolutionRequest('DELETE', `/instance/logout/${inst}`).catch(() => {});
      await this.evolutionRequest('DELETE', `/instance/delete/${inst}`).catch(() => {});

      // ← Limpa a sessão do Baileys via Evolution API
      await this.evolutionRequest('DELETE', `/instance/logout/${inst}`).catch(() => {});

      // Pede para a Evolution limpar o cache da instância
      await this.evolutionRequest('POST', `/instance/restart/${inst}`).catch(() => {});
    }

    await this.purgeWhatsAppSessionDataFromDatabase({
      configId: config.id,
      branchId: config.branchId ?? null,
      partnerId: config.partnerId ?? null,
      instanceName: inst,
    });
    if (inst) {
      this.lidMapCache.delete(inst);
    }
    this.purgeInboundCrmThrottleMapsForBranch(config.branchId ?? undefined);

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

    if (!config) {
      return { status: 'disconnected' as const, crmBootBotEnabled: false };
    }

    const baseMeta = {
      crmBootBotEnabled: !!config.crmBootBotEnabled,
      phoneNumber: config.phoneNumber ?? null,
      profileName: config.profileName ?? null,
      profilePicUrl: config.profilePicUrl ?? null,
      instanceName: config.instanceName ?? null,
      branchId: config.branchId ?? null,
      partnerId: config.partnerId ?? null,
    };

    if (!config.instanceName) {
      return {
        status: (config.status ?? 'disconnected') as string,
        ...baseMeta,
      };
    }

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
        ...baseMeta,
      };
    } catch {
      return {
        status: config.status ?? 'disconnected',
        ...baseMeta,
      };
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

  /** Variações @s.whatsapp.net (com/sem dígito 9) porque a Evolution costuma indexar só um formato. */
  private expandBrazilPhoneJids(jid: string): string[] {
    if (!isPhoneJid(jid)) return [jid];
    const raw = phoneFromJid(jid).replace(/\D/g, '');
    const out = new Set<string>([jid]);
    const norm = normalizeBrazilPhone(raw.startsWith('55') ? raw : `55${raw}`);
    if (norm) out.add(`${norm}@s.whatsapp.net`);

    if (raw.startsWith('55') && raw.length >= 12) {
      const ddd = raw.slice(2, 4);
      const local = raw.slice(4);
      if (ddd.length === 2 && local.length === 9 && local[0] === '9') {
        out.add(`55${ddd}${local.slice(1)}@s.whatsapp.net`);
      }
      if (ddd.length === 2 && local.length === 8) {
        out.add(`55${ddd}9${local}@s.whatsapp.net`);
      }
    }

    return [...out];
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
    const { jid, count } = dto;

    if (!jid || isGroupJid(jid)) {
      return [];
    }

    const config = await prisma.whatsAppConfig.findUnique({
      where: { branchId },
    });

    if (!config?.instanceName) {
      return [];
    }

    const desiredCount = Math.min(Math.max(Number(count) || 100, 1), 5000);
    const fetchLimit = Math.min(Math.max(desiredCount + 20, 100), 5000);

    const baseJids = await this.relatedJids(config.instanceName, jid, config.phoneNumber);
    const jidsToFetch = [...new Set(baseJids.flatMap((j) => this.expandBrazilPhoneJids(j)))];
    const allowedConversationJids = new Set(jidsToFetch);

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
          limit: fetchLimit,
          offset: 0,
        },
      ).catch(() => null);
      if (!raw) continue;
      const extracted = this.extractMessages(raw).filter((m: any) =>
        this.messageBelongsToConversation(m, allowedConversationJids),
      );
      allRaw.push(...extracted);
    }

    const localRows = await prisma.whatsAppMessage.findMany({
      where: {
        branchId,
        remoteJid: { in: jidsToFetch },
      },
      orderBy: { sentAt: 'desc' },
      take: Math.min(desiredCount * 4, 500),
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
    ].filter((m: any) => this.messageBelongsToConversation(m, allowedConversationJids));

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
      .sort((a: any, b: any) => Number(b?.messageTimestamp ?? 0) - Number(a?.messageTimestamp ?? 0));

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

    return normalized.slice(0, desiredCount);
  }

  async sendCrmMessage(branchId: string, dto: SendCrmMessageDto) {
    const config = await this.requireConnectedConfig(branchId);

    const result = await this.evolutionRequest(
      'POST',
      `/message/sendText/${config.instanceName}`,
      { number: dto.jid, text: dto.text },
    );

    return {
      success: true,
      messageId: result?.key?.id ?? null,
      key: result?.key as { id?: string; remoteJid?: string; fromMe?: boolean } | undefined,
    };
  }

  /**
   * Dispara mensagens segmentadas quando o cliente manda mensagem(s) inbound e:
   * - é o **primeiro** registro inbound deste contato na filial; ou
   * - já houve outbound antes mas passou **`CRM_BOOT_GREETING_REPEAT_AFTER_HOURS`** (default **24**) desde o inbound anterior —
   *   alinhado à ideia de “nova sessão” após inatividade.
   * Use **`CRM_BOOT_GREETING_REPEAT_AFTER_HOURS=0`** para manter apenas a primeira vez (comportamento antigo).
   */
  async trySendCrmBootGreetingSequence(opts: {
    branchId: string;
    syncJids: string[];
    remoteJid: string;
    customerPhoneDigits: string;
    customerDisplayName?: string | null;
  }): Promise<void> {
    const { branchId, syncJids, remoteJid, customerPhoneDigits, customerDisplayName } = opts;

    if (syncJids.some((j) => isGroupJid(j))) return;

    const phoneJidCandidate =
      syncJids.find((j) => isPhoneJid(j)) ?? (isPhoneJid(remoteJid) ? remoteJid : null);
    const lidOrCanonical =
      syncJids.find((j) => isLidJid(j)) ?? (isLidJid(remoteJid) ? remoteJid : null);
    const sendJid = phoneJidCandidate ?? lidOrCanonical ?? remoteJid;
    if (!sendJid || isGroupJid(sendJid)) return;

    const config = (await prisma.whatsAppConfig.findUnique({
      where: { branchId },
      select: {
        status: true,
        crmBootBotEnabled: true,
        crmBootGreetingFlows: true,
        instanceName: true,
      } as Record<string, boolean>,
    })) as null | {
      status: string;
      crmBootBotEnabled: boolean;
      crmBootGreetingFlows: unknown;
      instanceName: string | null;
    };

    if (!config?.crmBootBotEnabled || config.status !== 'connected' || !config.instanceName) {
      return;
    }

    const flowsRaw = config.crmBootGreetingFlows;
    if (WhatsAppService.isBootGreetingFlowDisabled(flowsRaw)) {
      return;
    }

    let segments = this.extractBootSegmentsForFlow(flowsRaw, 'greeting');
    if (segments.length === 0) {
      segments = WhatsAppService.defaultCrmBootGreetingFallbackSegments();
    }

    const repeatAfterMsOrFirstOnly =
      WhatsAppService.parseCrmBootGreetingRepeatAfterHours();

    if (repeatAfterMsOrFirstOnly === 'first_only') {
      const inboundCount = await prisma.whatsAppMessage.count({
        where: { branchId, fromMe: false, remoteJid: { in: syncJids } },
      });
      if (inboundCount !== 1) return;
    } else {
      const recentInbound = await prisma.whatsAppMessage.findMany({
        where: { branchId, fromMe: false, remoteJid: { in: syncJids } },
        orderBy: { sentAt: 'desc' },
        take: 2,
        select: { sentAt: true },
      });
      if (recentInbound.length < 1) return;
      if (recentInbound.length === 1) {
        /* primeira mensagem inbound registrada */
      } else {
        const newest = recentInbound[0].sentAt;
        const older = recentInbound[1].sentAt;
        const gapMs = newest.getTime() - older.getTime();
        if (gapMs < repeatAfterMsOrFirstOnly) return;
      }
    }

    const digits = (customerPhoneDigits || '').replace(/\D/g, '');
    const normalized =
      normalizeBrazilPhone(digits)
      || normalizeBrazilPhone(`55${digits}`)
      || (digits.startsWith('55') ? normalizeBrazilPhone(digits) : '')
      || '';
    const wo55 = normalized.startsWith('55') ? normalized.slice(2) : normalized;

    const orPhones = [
      normalized && normalized.length >= 12 ? normalized : '',
      wo55 && wo55.length >= 10 ? wo55 : '',
      digits && digits.length >= 10 ? digits : '',
    ].filter(Boolean);

    if (orPhones.length > 0) {
      const customer = await prisma.customer
        .findFirst({
          where: {
            branchId,
            OR: orPhones.map((phone) => ({ phone })),
          },
          select: { crmBootBotDisabled: true },
        })
        .catch(() => null);

      /** `crmBootBotDisabled`: sem automações do bot só neste cadastro (gatilho atual: boot/saudação; futuros fluxos devem repetir esta verificação). */
      if (customer?.crmBootBotDisabled) return;
    }

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: {
        companyId: true,
        subdomain: true,
        isOpen: true,
        openingHours: {
          select: {
            day: true,
            open: true,
            close: true,
            closed: true,
            date: true,
          },
        },
      },
    });
    if (!branch?.companyId) return;

    const schedules: BranchScheduleLike[] = (branch.openingHours ?? []).map((row) => ({
      day: row.day,
      open: row.open,
      close: row.close,
      closed: row.closed,
      date: row.date ?? null,
    }));

    const nowSp = getNowInSaoPaulo();
    const branchHoursFormatted = buildBranchOpeningHoursBlockPt(schedules);
    const branchHoursStatusLine = buildBranchOpenStatusLinePt({
      branchIsOpen: branch.isOpen,
      schedules,
      refInSaoPaulo: nowSp,
    });

    const ordersLink = this.buildBranchOrdersMenuUrl(branch.subdomain ?? null);
    const firstName = `${customerDisplayName ?? ''}`.trim().split(/\s+/)[0] ?? '';

    const ctxCustomerName = firstName || null;

    const sorted = [...segments].sort((a, b) => a.orderIndex - b.orderIndex);
    let first = true;
    for (const seg of sorted) {
      const text = substituteCrmBootTokens(seg.body, {
        customerName: ctxCustomerName,
        ordersLink,
        now: nowSp,
        branchHoursFormatted,
        branchHoursStatusLine,
      }).trim();

      if (!text) continue;
      if (!first) await this.delayMs(640);
      first = false;

      try {
        await this.evolutionRequest('POST', `/message/sendText/${config.instanceName}`, {
          number: sendJid,
          text,
        });
      } catch (err: any) {
        this.logger.warn(
          `[trySendCrmBootGreetingSequence] Falha ao enviar trecho (${seg.orderIndex}) para ${sendJid}: ${err?.message}`,
        );
      }
    }
  }

  /**
   * `CRM_BOOT_AI_REACTIVE_ENABLED=1`: classifica com Gemini perguntas de horário e envia fluxo `businessHours`.
   * Mensagens automáticas por loja FECHADA (operating status) ficam em `trySendCrmClosedOperatingAuto`.
   */
  private static isCrmAiReactiveEnabled(): boolean {
    const v = (process.env.CRM_BOOT_AI_REACTIVE_ENABLED ?? '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes' || v === 'on';
  }

  /** Automático quando a filial está fora do expediente (mensagem “fechado” só após ciclo fech→abrir). Default: ligado. */
  private static isCrmClosedAutoOperatingEnabled(): boolean {
    const v = (process.env.CRM_BOOT_CLOSED_AUTO_OPERATING_ENABLED ?? '1').trim().toLowerCase();
    return v !== '0' && v !== 'false' && v !== 'no' && v !== 'off';
  }

  private static parseCrmAiReactiveCooldownMinutes(): number {
    const raw = Number.parseFloat(
      (process.env.CRM_BOOT_AI_REACTIVE_COOLDOWN_MINUTES ?? '3').replace(',', '.'),
    );
    return Number.isFinite(raw) && raw > 0 ? raw : 3;
  }

  private crmAiReactiveCooldownMs(): number {
    const m = WhatsAppService.parseCrmAiReactiveCooldownMinutes();
    return Math.max(30_000, Math.round(m * 60 * 1000));
  }

  /**
   * Fora do expediente: envia `operatingStatus` sem esperar IA nem repetir ciclo da saudação.
   * Só volta a enviar quando a filial tiver ficado efectivamente ABERTA (expediente) ao menos uma vez desde o último envio ao mesmo contato.
   *
   * `CRM_BOOT_CLOSED_AUTO_OPERATING_ENABLED=0` desativa.
   */
  async trySendCrmClosedOperatingAuto(opts: {
    branchId: string;
    syncJids: string[];
    remoteJid: string;
    customerPhoneDigits: string;
    customerDisplayName?: string | null;
    inboundText?: string | null;
  }): Promise<boolean> {
    if (!WhatsAppService.isCrmClosedAutoOperatingEnabled()) return false;

    const { branchId, syncJids, remoteJid, customerPhoneDigits, customerDisplayName } = opts;
    if (!`${opts.inboundText ?? ''}`.trim()) return false;

    if (syncJids.some((j) => isGroupJid(j))) return false;

    const phoneJidCandidate =
      syncJids.find((j) => isPhoneJid(j)) ?? (isPhoneJid(remoteJid) ? remoteJid : null);
    const lidOrCanonical =
      syncJids.find((j) => isLidJid(j)) ?? (isLidJid(remoteJid) ? remoteJid : null);
    const sendJid = phoneJidCandidate ?? lidOrCanonical ?? remoteJid;
    if (!sendJid || isGroupJid(sendJid)) return false;

    const config = (await prisma.whatsAppConfig.findUnique({
      where: { branchId },
      select: {
        status: true,
        crmBootBotEnabled: true,
        crmBootGreetingFlows: true,
        instanceName: true,
      } as Record<string, boolean>,
    })) as null | {
      status: string;
      crmBootBotEnabled: boolean;
      crmBootGreetingFlows: unknown;
      instanceName: string | null;
    };

    if (!config?.crmBootBotEnabled || config.status !== 'connected' || !config.instanceName) {
      return false;
    }

    const flowsRaw = config.crmBootGreetingFlows;

    const digits = (customerPhoneDigits || '').replace(/\D/g, '');
    const normalized =
      normalizeBrazilPhone(digits) ||
      normalizeBrazilPhone(`55${digits}`) ||
      (digits.startsWith('55') ? normalizeBrazilPhone(digits) : '') ||
      '';
    const wo55 = normalized.startsWith('55') ? normalized.slice(2) : normalized;

    const orPhones = [
      normalized && normalized.length >= 12 ? normalized : '',
      wo55 && wo55.length >= 10 ? wo55 : '',
      digits && digits.length >= 10 ? digits : '',
    ].filter(Boolean);

    if (orPhones.length > 0) {
      const customer = await prisma.customer
        .findFirst({
          where: {
            branchId,
            OR: orPhones.map((phone) => ({ phone })),
          },
          select: { crmBootBotDisabled: true },
        })
        .catch(() => null);

      if (customer?.crmBootBotDisabled) return false;
    }

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: {
        companyId: true,
        subdomain: true,
        isOpen: true,
        openingHours: {
          select: {
            day: true,
            open: true,
            close: true,
            closed: true,
            date: true,
          },
        },
      },
    });
    if (!branch?.companyId) return false;

    const schedules: BranchScheduleLike[] = (branch.openingHours ?? []).map((row) => ({
      day: row.day,
      open: row.open,
      close: row.close,
      closed: row.closed,
      date: row.date ?? null,
    }));

    const nowSp = getNowInSaoPaulo();
    const effectivelyClosedNow = isBranchEffectivelyClosedForContactNow({
      branchIsOpen: branch.isOpen,
      schedules,
      refInSaoPaulo: nowSp,
    });
    const stateKey = `${branchId}:${sendJid}`;
    let armedForNextClosure = this.crmClosedOperatingArmed.get(stateKey);

    /** Primeiro contacto: permitir primeira bolha quando fechado. */
    if (armedForNextClosure === undefined) armedForNextClosure = true;

    if (!effectivelyClosedNow) {
      this.crmClosedOperatingArmed.set(stateKey, true);
      return false;
    }

    if (!armedForNextClosure) return false;

    const branchHoursFormatted = buildBranchOpeningHoursBlockPt(schedules);
    const branchHoursStatusLine = buildBranchOpenStatusLinePt({
      branchIsOpen: branch.isOpen,
      schedules,
      refInSaoPaulo: nowSp,
    });
    const ordersLink = this.buildBranchOrdersMenuUrl(branch.subdomain ?? null);
    const firstName = `${customerDisplayName ?? ''}`.trim().split(/\s+/)[0] ?? '';
    const ctxCustomerName = firstName || null;

    const sortedSegs = [...this.extractBootSegmentsForFlow(flowsRaw, 'operatingStatus')]
      .filter((s) => s.body.trim())
      .sort((a, b) => a.orderIndex - b.orderIndex);

    if (sortedSegs.length === 0) return false;

    let pauseBetweenBolhas = false;
    let anySentBubble = false;
    for (const seg of sortedSegs) {
      const text = substituteCrmBootTokens(seg.body, {
        customerName: ctxCustomerName,
        ordersLink,
        now: nowSp,
        branchHoursFormatted,
        branchHoursStatusLine,
      }).trim();

      if (!text) continue;
      if (pauseBetweenBolhas) await this.delayMs(640);
      pauseBetweenBolhas = true;

      try {
        await this.evolutionRequest('POST', `/message/sendText/${config.instanceName}`, {
          number: sendJid,
          text,
        });
        anySentBubble = true;
      } catch (err: any) {
        this.logger.warn(
          `[trySendCrmClosedOperatingAuto] operatingStatus trecho ${seg.orderIndex}: ${err?.message}`,
        );
      }
    }

    if (anySentBubble) this.crmClosedOperatingArmed.set(stateKey, false);

    return anySentBubble;
  }

  /**
   * Automático inbound: primeiro aviso quando fechado (sem ciclo da saudação), depois horários por Gemini, senão saudação.
   */
  async handleCrmInboundBootAndReactive(opts: {
    branchId: string;
    syncJids: string[];
    remoteJid: string;
    customerPhoneDigits: string;
    customerDisplayName?: string | null;
    inboundText?: string | null;
  }): Promise<void> {
    const closedOperatingSent = await this.trySendCrmClosedOperatingAuto(opts);
    const reactiveHandled = await this.trySendCrmAiReactiveFlows(opts);
    if (closedOperatingSent || reactiveHandled) return;

    await this.trySendCrmBootGreetingSequence({
      branchId: opts.branchId,
      syncJids: opts.syncJids,
      remoteJid: opts.remoteJid,
      customerPhoneDigits: opts.customerPhoneDigits,
      customerDisplayName: opts.customerDisplayName,
    });
  }

  /** @returns true se pelo menos uma bolha foi enviada pela resposta contextual. */
  async trySendCrmAiReactiveFlows(opts: {
    branchId: string;
    syncJids: string[];
    remoteJid: string;
    customerPhoneDigits: string;
    customerDisplayName?: string | null;
    inboundText?: string | null;
  }): Promise<boolean> {
    if (!WhatsAppService.isCrmAiReactiveEnabled()) return false;

    const { branchId, syncJids, remoteJid, customerPhoneDigits, customerDisplayName } = opts;
    const inboundTextRaw = `${opts.inboundText ?? ''}`.trim();
    if (!inboundTextRaw) return false;

    if (syncJids.some((j) => isGroupJid(j))) return false;

    const phoneJidCandidate =
      syncJids.find((j) => isPhoneJid(j)) ?? (isPhoneJid(remoteJid) ? remoteJid : null);
    const lidOrCanonical =
      syncJids.find((j) => isLidJid(j)) ?? (isLidJid(remoteJid) ? remoteJid : null);
    const sendJid = phoneJidCandidate ?? lidOrCanonical ?? remoteJid;
    if (!sendJid || isGroupJid(sendJid)) return false;

    const config = (await prisma.whatsAppConfig.findUnique({
      where: { branchId },
      select: {
        status: true,
        crmBootBotEnabled: true,
        crmBootGreetingFlows: true,
        instanceName: true,
      } as Record<string, boolean>,
    })) as null | {
      status: string;
      crmBootBotEnabled: boolean;
      crmBootGreetingFlows: unknown;
      instanceName: string | null;
    };

    if (!config?.crmBootBotEnabled || config.status !== 'connected' || !config.instanceName) {
      return false;
    }

    const flowsRaw = config.crmBootGreetingFlows;

    const digits = (customerPhoneDigits || '').replace(/\D/g, '');
    const normalized =
      normalizeBrazilPhone(digits) ||
      normalizeBrazilPhone(`55${digits}`) ||
      (digits.startsWith('55') ? normalizeBrazilPhone(digits) : '') ||
      '';
    const wo55 = normalized.startsWith('55') ? normalized.slice(2) : normalized;

    const orPhones = [
      normalized && normalized.length >= 12 ? normalized : '',
      wo55 && wo55.length >= 10 ? wo55 : '',
      digits && digits.length >= 10 ? digits : '',
    ].filter(Boolean);

    if (orPhones.length > 0) {
      const customer = await prisma.customer
        .findFirst({
          where: {
            branchId,
            OR: orPhones.map((phone) => ({ phone })),
          },
          select: { crmBootBotDisabled: true },
        })
        .catch(() => null);

      if (customer?.crmBootBotDisabled) return false;
    }

    const intents = await this.aiService.classifyCrmReactiveIntents(inboundTextRaw.slice(0, 800));
    if (intents.length === 0) return false;

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: {
        companyId: true,
        subdomain: true,
        isOpen: true,
        openingHours: {
          select: {
            day: true,
            open: true,
            close: true,
            closed: true,
            date: true,
          },
        },
      },
    });
    if (!branch?.companyId) return false;

    const schedules: BranchScheduleLike[] = (branch.openingHours ?? []).map((row) => ({
      day: row.day,
      open: row.open,
      close: row.close,
      closed: row.closed,
      date: row.date ?? null,
    }));

    const nowSp = getNowInSaoPaulo();
    const branchHoursFormatted = buildBranchOpeningHoursBlockPt(schedules);
    const branchHoursStatusLine = buildBranchOpenStatusLinePt({
      branchIsOpen: branch.isOpen,
      schedules,
      refInSaoPaulo: nowSp,
    });

    const ordersLink = this.buildBranchOrdersMenuUrl(branch.subdomain ?? null);
    const firstName = `${customerDisplayName ?? ''}`.trim().split(/\s+/)[0] ?? '';
    const ctxCustomerName = firstName || null;

    const cooldownMs = this.crmAiReactiveCooldownMs();
    const throttleBase = `${branchId}:${sendJid}`;

    let anySentBubble = false;
    let pauseBetweenBolhas = false;

    for (const intent of intents) {
      if (intent !== 'businessHours') continue;
      const flowKey = 'businessHours' as const;

      const throttleKey = `${throttleBase}:${flowKey}`;
      const ts = Date.now();
      const last = this.crmAiReactiveSentAt.get(throttleKey);
      if (last && ts - last < cooldownMs) continue;

      const segmentsRaw = this.extractBootSegmentsForFlow(flowsRaw, flowKey).filter((s) => s.body.trim());
      const sortedSegs = [...segmentsRaw].sort((a, b) => a.orderIndex - b.orderIndex);

      if (sortedSegs.length === 0) continue;

      let sentThisFlow = false;
      for (const seg of sortedSegs) {
        const text = substituteCrmBootTokens(seg.body, {
          customerName: ctxCustomerName,
          ordersLink,
          now: nowSp,
          branchHoursFormatted,
          branchHoursStatusLine,
        }).trim();

        if (!text) continue;
        if (pauseBetweenBolhas) await this.delayMs(640);
        pauseBetweenBolhas = true;

        try {
          await this.evolutionRequest('POST', `/message/sendText/${config.instanceName}`, {
            number: sendJid,
            text,
          });
          anySentBubble = true;
          sentThisFlow = true;
        } catch (err: any) {
          this.logger.warn(
            `[trySendCrmAiReactiveFlows] (${flowKey}) trecho ${seg.orderIndex}: ${err?.message}`,
          );
        }
      }

      if (sentThisFlow) {
        this.crmAiReactiveSentAt.set(throttleKey, Date.now());
      }
    }

    return anySentBubble;
  }

  private sanitizeBootGreetingFlows(raw: unknown): Record<string, unknown> {
    const rec =
      WhatsAppService.normalizeFlowsInputToRecord(raw) ??
      WhatsAppService.normalizeFlowsInputToRecord(null);
    return rec ?? WhatsAppService.blankCrmBootGreetingFlows();
  }

  /** Extrai corpos ordenados do JSON gravado na config por fluxo (webhook). */
  private extractBootSegmentsForFlow(
    flows: unknown,
    flowKey: 'greeting' | 'operatingStatus' | 'businessHours',
  ): Array<{ body: string; orderIndex: number }> {
    const rec = WhatsAppService.normalizeFlowsInputToRecord(flows);
    if (!rec) {
      return flowKey === 'greeting'
        ? WhatsAppService.bootFlowFallbackBodies('greeting').map((s) => ({ ...s }))
        : [];
    }

    const slice = rec[flowKey] as Record<string, unknown> | undefined;
    if (!slice || typeof slice !== 'object' || slice['enabled'] === false) return [];

    const useDefaultTemplate = slice['useDefaultTemplate'] !== false;
    const segmentsArr = slice['segments'];

    const hasCustomBodies =
      Array.isArray(segmentsArr) &&
      segmentsArr.some((entry: unknown) => {
        if (!entry || typeof entry !== 'object') return false;
        const b = (entry as Record<string, unknown>)['body'];
        return typeof b === 'string' && b.trim().length > 0;
      });

    if (useDefaultTemplate && !hasCustomBodies) {
      return WhatsAppService.bootFlowFallbackBodies(flowKey).map((s) => ({ ...s }));
    }

    const out: Array<{ body: string; orderIndex: number }> = [];
    const segs = Array.isArray(segmentsArr) ? segmentsArr : [];
    segs.forEach((entry: unknown, i: number) => {
      if (!entry || typeof entry !== 'object') return;
      const e = entry as Record<string, unknown>;
      const body = typeof e['body'] === 'string' ? e['body'] : '';
      const oiRaw = e['orderIndex'];
      const orderIndex =
        typeof oiRaw === 'number' && Number.isFinite(oiRaw) ? oiRaw : i + 1;
      out.push({ body, orderIndex });
    });
    return out;
  }

  private static normalizeSingleBootFlow(
    rawSlice: unknown,
    blankSlice: Record<string, unknown>,
  ): Record<string, unknown> {
    let enabled = typeof blankSlice['enabled'] === 'boolean' ? (blankSlice['enabled'] as boolean) : true;
    let useDefaultTemplate =
      typeof blankSlice['useDefaultTemplate'] === 'boolean'
        ? (blankSlice['useDefaultTemplate'] as boolean)
        : true;
    let segments: unknown[] = [];

    if (rawSlice !== null && typeof rawSlice === 'object' && !Array.isArray(rawSlice)) {
      const o = rawSlice as Record<string, unknown>;
      if (typeof o['enabled'] === 'boolean') enabled = o['enabled'];
      if (typeof o['useDefaultTemplate'] === 'boolean')
        useDefaultTemplate = o['useDefaultTemplate'] as boolean;
      segments = Array.isArray(o['segments']) ? [...(o['segments'] as unknown[])] : [];
    }

    const numbered = WhatsAppService.cleanBootFlowSegmentEntries(segments);
    return {
      enabled,
      useDefaultTemplate,
      segments: numbered.map((s) => ({
        id: s.id,
        orderIndex: s.orderIndex,
        body: s.body,
      })),
    };
  }

  private static cleanBootFlowSegmentEntries(
    segmentsInput: unknown[],
  ): Array<{ id: string; orderIndex: number; body: string }> {
    const cleaned = segmentsInput
      .map((entry: unknown, i: number) => {
        if (!entry || typeof entry !== 'object') return null;
        const e = entry as Record<string, unknown>;
        const rawId =
          typeof e['id'] === 'string' && `${e['id']}`.length > 0 ? (e['id'] as string) : null;
        const body =
          typeof e['body'] === 'string' ? (e['body'] as string).slice(0, 4096) : '';
        const oiRaw = e['orderIndex'];
        const orderIndex =
          typeof oiRaw === 'number' && Number.isFinite(oiRaw) ? oiRaw : i + 1;
        const safeId =
          rawId && /^[a-zA-Z0-9_-]+$/.test(rawId)
            ? rawId
            : `seg_${randomUUID().replace(/-/g, '').slice(0, 10)}`;

        return { id: safeId, orderIndex, body };
      })
      .filter(Boolean) as Array<{ id: string; orderIndex: number; body: string }>;

    return cleaned.map((s, idx) => ({ ...s, orderIndex: idx + 1 }));
  }

  private static normalizeFlowsInputToRecord(flows: unknown): Record<
    string,
    unknown
  > | null {
    if (flows === null || flows === undefined) return WhatsAppService.blankCrmBootGreetingFlows();
    if (typeof flows !== 'object' || Array.isArray(flows)) return null;
    const root = flows as Record<string, unknown>;
    const blank = WhatsAppService.blankCrmBootGreetingFlows();
    const blankGreeting = blank['greeting'] as Record<string, unknown>;
    const blankOperating = blank['operatingStatus'] as Record<string, unknown>;
    const blankBusinessHours = blank['businessHours'] as Record<string, unknown>;

    const reservedKeys = new Set(['greeting', 'operatingStatus', 'businessHours']);
    const preserved: Record<string, unknown> = {};
    for (const key of Object.keys(root)) {
      if (reservedKeys.has(key)) continue;
      if (/^[a-z][a-z0-9_]*$/i.test(key) && key.length <= 64) preserved[key] = root[key];
    }

    return {
      ...preserved,
      greeting: WhatsAppService.normalizeSingleBootFlow(root['greeting'], blankGreeting),
      operatingStatus: WhatsAppService.normalizeSingleBootFlow(
        root['operatingStatus'],
        blankOperating,
      ),
      businessHours: WhatsAppService.normalizeSingleBootFlow(
        root['businessHours'],
        blankBusinessHours,
      ),
    };
  }

  /** URL pública da loja (subdomínio + FRONTEND_URL), sem path. */
  private buildBranchOrdersMenuUrl(subdomain: string | null): string {
    return buildBranchStorefrontPublicUrl(subdomain);
  }

  private delayMs(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

      const markReadViaEvolution = async (): Promise<void> => {
        const readAll = await this.evolutionRequest(
          'POST',
          `/chat/readMessages/${config.instanceName}`,
          { number: jid, readMessages: true },
        ).catch(() => null);
        if (readAll !== null && readAll !== undefined) return;

        const lastRows = await prisma.chatLastMessage.findMany({
          where: {
            branchId,
            remoteJid: { in: syncJids },
          },
          orderBy: { timestamp: 'desc' },
          take: 8,
        });
        const toMark =
          lastRows.find((r) => !r.fromMe && r.messageId) ?? lastRows.find((r) => r.messageId);
        if (!toMark?.messageId) return;

        const remoteForMark =
          isPhoneJid(jid)
            ? jid
            : isPhoneJid(toMark.remoteJid)
              ? toMark.remoteJid
              : `${toMark.remoteJid}`.includes('@')
                ? toMark.remoteJid
                : jid;

        await this.evolutionRequest('POST', `/chat/markMessageAsRead/${config.instanceName}`, {
          readMessages: [
            {
              remoteJid: remoteForMark,
              fromMe: !!toMark.fromMe,
              id: toMark.messageId,
            },
          ],
        }).catch(() => null);
      };

      await markReadViaEvolution();
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

  /**
   * Mesma heurística que o Evo CRM usa: a Evolution nem sempre respeita o filtro e o payload varia (v2.3, paginação, etc.).
   */
  private messageBelongsToConversation(msg: unknown, conversationJids: Set<string>): boolean {
    const m = msg as { key?: { remoteJid?: string }; remoteJid?: string };
    if (!m) return false;
    const msgJid = m.key?.remoteJid || m.remoteJid;
    if (!msgJid || typeof msgJid !== 'string') return false;
    if (isGroupJid(msgJid)) return false;
    if (conversationJids.has(msgJid)) return true;
    if (isPhoneJid(msgJid)) {
      const msgPhone = phoneFromJid(msgJid);
      for (const j of conversationJids) {
        if (isPhoneJid(j) && phonesMatch(msgPhone, phoneFromJid(j))) return true;
      }
    }
    return false;
  }

  private extractMessages(result: unknown): any[] {
    if (result == null) return [];
    const data = result as any;

    if (Array.isArray(data)) return data;

    if (data && typeof data === 'object' && 'messages' in data) {
      const raw = data.messages;
      if (Array.isArray(raw)) return raw;
      if (raw && typeof raw === 'object') {
        const o = raw as Record<string, unknown>;
        if (Array.isArray(o.records)) return o.records as any[];
        if (Array.isArray(o.data)) return o.data as any[];
        if (Array.isArray(o.messages)) return o.messages as any[];
        if (Array.isArray(o.rows)) return o.rows as any[];
        const values = Object.values(o);
        if (
          values.length > 0 &&
          values.every(
            (v) =>
              v &&
              typeof v === 'object' &&
              ('key' in (v as object) || 'message' in (v as object)),
          )
        ) {
          return values as any[];
        }
      }
    }

    if (data && typeof data === 'object' && Array.isArray(data.data)) return data.data;
    if (data && typeof data === 'object' && Array.isArray(data.records)) return data.records;

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