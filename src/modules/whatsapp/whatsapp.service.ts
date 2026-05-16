import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import type { OrderChannelCampaign, OrderOrigin, Prisma } from '@prisma/client';
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
  formatCrmProductListBlock,
  searchBranchProductsForCrm,
} from 'src/utils/whatsapp-crm-product-search';
import { resolveBranchAddressFormatted } from 'src/utils/whatsapp-crm-branch-address';
import { resolveDeliveryPaymentMethodsFormatted } from 'src/utils/whatsapp-crm-branch-payment-methods';
import { resolveBranchProductPromotionsFormatted } from 'src/utils/whatsapp-crm-product-promotions';
import {
  blankCrmOrderStatusNotifications,
  CRM_ORDER_STATUS_NOTIFICATIONS_FLOW_KEY,
  legacyFlagsFromOrderStatusNotifications,
  mergeOrderStatusNotificationsIntoFlows,
  readGranularOrderStatusNotificationsForApi,
  readOrderStatusNotificationsFromFlows,
  resolveCrmOrderStatusNotifications,
  sanitizeCrmOrderStatusNotificationsInput,
} from 'src/utils/whatsapp-crm-order-status-notifications';
import {
  buildBranchOpeningHoursBlockPt,
  buildBranchOpenStatusLinePt,
  formatDateYmdInSaoPaulo,
  getNowInSaoPaulo,
  isBranchEffectivelyClosedForContactNow,
  type BranchScheduleLike,
} from '../../utils/branch-schedule-for-chatbot';
import { buildBranchStorefrontPublicUrl } from 'src/utils/storefront-url';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import {
  buildOrderChannelCampaignLink,
  isValidOrderOriginCode,
  suggestOrderOriginCode as generateOrderOriginCode,
} from '../../utils/order-channel-campaign';
import {
  parseOrderCampaignRecipientsJson,
  substituteOrderCampaignMessage,
} from '../../utils/order-campaign-message';
import {
  mapEvolutionAckToCampaignMessageStatus,
  shouldAdvanceCampaignMessageStatus,
  type OrderChannelCampaignMessageStatus,
} from '../../utils/order-channel-campaign-stats';

export interface OrderChannelCampaignDispatchResult {
  sent: number;
  failed: number;
  errors: string[];
}

/** Item da listagem GET /whatsapp/order-campaigns */
export interface OrderChannelCampaignListItem {
  id: string;
  branchId: string;
  orderOriginId: string;
  title: string;
  phoneNumber: string;
  description: string | null;
  imageUrl: string | null;
  recipients: unknown;
  orderChannelCode: string;
  linkUrl: string;
  createdAt: Date;
  updatedAt: Date;
  originNumber: string;
  originName: string;
  dispatchedAt: Date | null;
  recipientCount: number;
  processedCount: number;
  sentCount: number;
  readCount: number;
  failedCount: number;
  orderOrigin?: { id: string; name: string; code: string };
}

export type OrderChannelCampaignSaveResponse = OrderChannelCampaignListItem & {
  dispatch?: OrderChannelCampaignDispatchResult | null;
};

export interface OrderChannelCampaignDashboardResponse {
  campaign: OrderChannelCampaignListItem;
  messagePreview: string | null;
}

export type OrderChannelCampaignMessageDisplayStatus = 'pending' | 'sent' | 'failed';

export interface OrderChannelCampaignMessageListItem {
  id: string;
  customerId: string | null;
  name: string;
  phone: string;
  status: OrderChannelCampaignMessageDisplayStatus;
  statusLabel: string;
  sentAt: Date | null;
  readAt: Date | null;
  errorMessage: string | null;
}

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
      orderMenuLink: {
        enabled: true,
        useDefaultTemplate: true,
        segments: [],
      },
      productInfo: {
        enabled: true,
        useDefaultTemplate: true,
        segments: [],
      },
      establishmentAddress: {
        enabled: true,
        useDefaultTemplate: true,
        segments: [],
      },
      deliveryPaymentMethods: {
        enabled: true,
        useDefaultTemplate: true,
        segments: [],
      },
      productPromotions: {
        enabled: true,
        useDefaultTemplate: true,
        segments: [],
      },
    };
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

  private static defaultCrmBootOrderMenuLinkFallbackSegments(): Array<{ body: string; orderIndex: number }> {
    return [
      {
        orderIndex: 1,
        body:
          '{{saudacao_horario}}, {{nome_cliente}}!\n\nSegue o link do nosso cardápio para você pedir:\n{{link_pedidos}}',
      },
    ];
  }

  private static defaultCrmBootProductInfoFallbackSegments(): Array<{ body: string; orderIndex: number }> {
    return [
      {
        orderIndex: 1,
        body:
          '{{saudacao_horario}}, {{nome_cliente}}!\n\n{{lista_produtos}}\n\nPara ver o cardápio completo ou pedir: {{link_pedidos}}',
      },
    ];
  }

  private static defaultCrmBootEstablishmentAddressFallbackSegments(): Array<{
    body: string;
    orderIndex: number;
  }> {
    return [
      {
        orderIndex: 1,
        body:
          '{{saudacao_horario}}, {{nome_cliente}}!\n\nNosso endereço:\n\n{{endereco_filial}}',
      },
    ];
  }

  private static defaultCrmBootDeliveryPaymentMethodsFallbackSegments(): Array<{
    body: string;
    orderIndex: number;
  }> {
    return [
      {
        orderIndex: 1,
        body:
          '{{saudacao_horario}}, {{nome_cliente}}!\n\n{{metodos_pagamento_delivery}}\n\nPedidos pelo delivery online: {{link_pedidos}}',
      },
    ];
  }

  private static defaultCrmBootProductPromotionsFallbackSegments(): Array<{
    body: string;
    orderIndex: number;
  }> {
    return [
      {
        orderIndex: 1,
        body:
          '{{saudacao_horario}}, {{nome_cliente}}!\n\n{{lista_promocoes}}\n\nPedidos: {{link_pedidos}}',
      },
    ];
  }

  private static bootFlowFallbackBodies(
    flowKey:
      | 'greeting'
      | 'operatingStatus'
      | 'businessHours'
      | 'orderMenuLink'
      | 'productInfo'
      | 'establishmentAddress'
      | 'deliveryPaymentMethods'
      | 'productPromotions',
  ): Array<{ body: string; orderIndex: number }> {
    if (flowKey === 'greeting') return WhatsAppService.defaultCrmBootGreetingFallbackSegments();
    if (flowKey === 'operatingStatus') return WhatsAppService.defaultCrmBootOperatingStatusFallbackSegments();
    if (flowKey === 'businessHours') return WhatsAppService.defaultCrmBootBusinessHoursFallbackSegments();
    if (flowKey === 'orderMenuLink') return WhatsAppService.defaultCrmBootOrderMenuLinkFallbackSegments();
    if (flowKey === 'productInfo') return WhatsAppService.defaultCrmBootProductInfoFallbackSegments();
    if (flowKey === 'establishmentAddress') {
      return WhatsAppService.defaultCrmBootEstablishmentAddressFallbackSegments();
    }
    if (flowKey === 'deliveryPaymentMethods') {
      return WhatsAppService.defaultCrmBootDeliveryPaymentMethodsFallbackSegments();
    }
    return WhatsAppService.defaultCrmBootProductPromotionsFallbackSegments();
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

  /** Cooldown por branch + JID de envio + fluxo reativo (`businessHours`, `orderMenuLink`). */
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
        crmOrderStatusNotifications: blankCrmOrderStatusNotifications(),
      };
    }

    const { serverUrl: _s, apiKey: _a, ...safe } = config as any;
    safe.crmOrderStatusNotifications = readGranularOrderStatusNotificationsForApi(safe);
    return safe;
  }

  /** Remove chaves `undefined` — Prisma rejeita no update/create e o XOR do upsert quebra com `branchId`. */
  private static omitUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) out[key] = value;
    }
    return out;
  }

  async updateConfig(branchId: string, dto: UpdateWhatsAppConfigDto) {
    const rawDto = dto as unknown as Record<string, unknown>;
    const { crmBootGreetingFlows: rawFlows, crmOrderStatusNotifications: rawStatus, ...rest } =
      rawDto;

    const data: Record<string, unknown> = { ...rest };

    let flowsForSave: Record<string, unknown> | undefined;
    if ('crmBootGreetingFlows' in rawDto) {
      flowsForSave = this.sanitizeBootGreetingFlows(rawFlows as unknown);
    }

    let notifications: ReturnType<typeof sanitizeCrmOrderStatusNotificationsInput> | undefined;
    if ('crmOrderStatusNotifications' in rawDto) {
      notifications = sanitizeCrmOrderStatusNotificationsInput(rawStatus);
    } else if (flowsForSave) {
      const notifBlock = readOrderStatusNotificationsFromFlows(flowsForSave);
      if (notifBlock != null) {
        notifications = sanitizeCrmOrderStatusNotificationsInput(notifBlock);
      }
    }

    if (notifications) {
      data.crmOrderStatusNotifications = notifications;
      Object.assign(data, legacyFlagsFromOrderStatusNotifications(notifications));

      let flowsBase: unknown = flowsForSave;
      if (!flowsBase) {
        const row = await prisma.whatsAppConfig.findUnique({
          where: { branchId },
          select: { crmBootGreetingFlows: true },
        });
        flowsBase = row?.crmBootGreetingFlows ?? WhatsAppService.blankCrmBootGreetingFlows();
      }
      flowsForSave = mergeOrderStatusNotificationsIntoFlows(flowsBase, notifications);
    }

    if (flowsForSave) {
      data.crmBootGreetingFlows = flowsForSave;
    }

    const payload = WhatsAppService.omitUndefined(data);

    const existing = await prisma.whatsAppConfig.findUnique({
      where: { branchId },
      select: { id: true },
    });

    if (existing) {
      await prisma.whatsAppConfig.update({
        where: { branchId },
        data: payload as any,
      });
    } else {
      await prisma.whatsAppConfig.create({
        data: {
          branchId,
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
          crmBootGreetingFlows: mergeOrderStatusNotificationsIntoFlows(
            WhatsAppService.blankCrmBootGreetingFlows(),
            blankCrmOrderStatusNotifications(),
          ),
          ...payload,
        } as any,
      });
    }

    return this.getConfig(branchId);
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
      let phoneNumber = config.phoneNumber ?? null;
      let profileName = config.profileName ?? null;
      let profilePicUrl = config.profilePicUrl ?? null;

      if (state === 'open') {
        status = 'connected';
        if (config.status !== 'connected') {
          await prisma.whatsAppConfig.update({
            where: { id: config.id },
            data: { status: 'connected', qrCode: null },
          });
        }
        const synced = await this.syncInstanceProfileFromEvolution(config, res);
        phoneNumber = synced.phoneNumber;
        profileName = synced.profileName;
        profilePicUrl = synced.profilePicUrl;
      } else if (state === 'connecting') {
        status = config.qrCode ? 'qr_code' : 'connecting';
      } else {
        status = 'disconnected';
      }

      return {
        status,
        ...baseMeta,
        phoneNumber,
        profileName,
        profilePicUrl,
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
      instancePhone: this.connectedInstancePhone(config),
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
   * Chave estável por contato (telefone normalizado ou identidade do JID) para estado de saudação diária.
   */
  private static buildCrmBootGreetingContactKey(sendJid: string, wo55: string): string {
    const digits = `${wo55 || ''}`.replace(/\D/g, '');
    if (digits.length >= 10) return `ph:${digits}`;
    const local = `${sendJid}`.split('@')[0] ?? '';
    return `jid:${local.toLowerCase()}`;
  }

  /**
   * Dispara a saudação segmentada **no máximo uma vez por dia civil** (America/Sao_Paulo)
   * **por contato e filial**, e **só quando a filial está em expediente efectivo** (aberta para atendimento agora).
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
    const effectivelyClosed = isBranchEffectivelyClosedForContactNow({
      branchIsOpen: branch.isOpen,
      schedules,
      refInSaoPaulo: nowSp,
    });
    if (effectivelyClosed) return;

    const todaySp = formatDateYmdInSaoPaulo(nowSp);
    const contactKey = WhatsAppService.buildCrmBootGreetingContactKey(sendJid, wo55);

    const dayState = await prisma.crmBootGreetingDayState
      .findUnique({
        where: {
          branchId_contactKey: { branchId, contactKey },
        },
        select: { sentOnDate: true },
      })
      .catch(() => null);

    if (dayState?.sentOnDate === todaySp) return;

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
    let anySegmentSent = false;
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
        anySegmentSent = true;
      } catch (err: any) {
        this.logger.warn(
          `[trySendCrmBootGreetingSequence] Falha ao enviar trecho (${seg.orderIndex}) para ${sendJid}: ${err?.message}`,
        );
      }
    }

    if (anySegmentSent) {
      await prisma.crmBootGreetingDayState
        .upsert({
          where: { branchId_contactKey: { branchId, contactKey } },
          create: { branchId, contactKey, sentOnDate: todaySp },
          update: { sentOnDate: todaySp },
        })
        .catch((err) =>
          this.logger.warn(`[trySendCrmBootGreetingSequence] Falha ao gravar dia de saudação: ${err?.message}`),
        );
    }
  }

  /**
   * `CRM_BOOT_AI_REACTIVE_ENABLED=1`: classifica com Gemini (horários, link do cardápio) e envia os fluxos correspondentes.
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

    let productListFormatted: string | null = null;
    let productSearchLabel: string | null = null;
    if (intents.includes('productInfo')) {
      productSearchLabel =
        (await this.aiService.extractCrmProductSearchQuery(inboundTextRaw)) || inboundTextRaw.slice(0, 80);
      const hits = await searchBranchProductsForCrm(
        branchId,
        productSearchLabel,
      );
      productListFormatted = formatCrmProductListBlock(hits, productSearchLabel);
    }

    let branchAddressFormatted: string | null = null;
    if (intents.includes('establishmentAddress')) {
      branchAddressFormatted = await resolveBranchAddressFormatted(branchId);
    }

    let deliveryPaymentMethodsFormatted: string | null = null;
    if (intents.includes('deliveryPaymentMethods')) {
      deliveryPaymentMethodsFormatted = await resolveDeliveryPaymentMethodsFormatted(branchId);
    }

    let productPromotionsFormatted: string | null = null;
    if (intents.includes('productPromotions')) {
      productPromotionsFormatted = await resolveBranchProductPromotionsFormatted(branchId);
    }

    for (const intent of intents) {
      if (
        intent !== 'businessHours' &&
        intent !== 'orderMenuLink' &&
        intent !== 'productInfo' &&
        intent !== 'establishmentAddress' &&
        intent !== 'deliveryPaymentMethods' &&
        intent !== 'productPromotions'
      ) {
        continue;
      }
      const flowKey = intent;

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
          productsListFormatted:
            flowKey === 'productInfo' ? productListFormatted : null,
          branchAddressFormatted:
            flowKey === 'establishmentAddress' ? branchAddressFormatted : null,
          deliveryPaymentMethodsFormatted:
            flowKey === 'deliveryPaymentMethods' ? deliveryPaymentMethodsFormatted : null,
          productPromotionsFormatted:
            flowKey === 'productPromotions' ? productPromotionsFormatted : null,
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
    flowKey:
      | 'greeting'
      | 'operatingStatus'
      | 'businessHours'
      | 'orderMenuLink'
      | 'productInfo'
      | 'establishmentAddress'
      | 'deliveryPaymentMethods'
      | 'productPromotions',
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
    const blankOrderMenuLink = blank['orderMenuLink'] as Record<string, unknown>;
    const blankProductInfo = blank['productInfo'] as Record<string, unknown>;
    const blankEstablishmentAddress = blank['establishmentAddress'] as Record<string, unknown>;
    const blankDeliveryPaymentMethods = blank['deliveryPaymentMethods'] as Record<string, unknown>;
    const blankProductPromotions = blank['productPromotions'] as Record<string, unknown>;

    const reservedKeys = new Set([
      'greeting',
      'operatingStatus',
      'businessHours',
      'orderMenuLink',
      'productInfo',
      'establishmentAddress',
      'deliveryPaymentMethods',
      'productPromotions',
      CRM_ORDER_STATUS_NOTIFICATIONS_FLOW_KEY,
    ]);
    const preserved: Record<string, unknown> = {};
    for (const key of Object.keys(root)) {
      if (reservedKeys.has(key)) continue;
      if (/^[a-z][a-z0-9_]*$/i.test(key) && key.length <= 64) preserved[key] = root[key];
    }

    const normalized: Record<string, unknown> = {
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
      orderMenuLink: WhatsAppService.normalizeSingleBootFlow(
        root['orderMenuLink'],
        blankOrderMenuLink,
      ),
      productInfo: WhatsAppService.normalizeSingleBootFlow(
        root['productInfo'],
        blankProductInfo,
      ),
      establishmentAddress: WhatsAppService.normalizeSingleBootFlow(
        root['establishmentAddress'],
        blankEstablishmentAddress,
      ),
      deliveryPaymentMethods: WhatsAppService.normalizeSingleBootFlow(
        root['deliveryPaymentMethods'],
        blankDeliveryPaymentMethods,
      ),
      productPromotions: WhatsAppService.normalizeSingleBootFlow(
        root['productPromotions'],
        blankProductPromotions,
      ),
    };

    const notifRaw = root[CRM_ORDER_STATUS_NOTIFICATIONS_FLOW_KEY];
    if (notifRaw != null) {
      normalized[CRM_ORDER_STATUS_NOTIFICATIONS_FLOW_KEY] =
        sanitizeCrmOrderStatusNotificationsInput(notifRaw);
    }

    return normalized;
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
    // Campanhas: atualizado em handleMessageStatus/handleMessage com status bruto da Evolution.
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

  // ─── Origens de pedido (códigos curtos) ─────────────────────────────────────

  private readonly orderOriginInclude = {
    orderOrigin: { select: { id: true, name: true, code: true } },
  } satisfies Prisma.OrderChannelCampaignInclude;

  async getOrderOrigins(branchId: string): Promise<OrderOrigin[]> {
    return prisma.orderOrigin.findMany({
      where: { branchId },
      orderBy: { name: 'asc' },
    });
  }

  async suggestOrderOriginCode(branchId: string, name: string): Promise<{ code: string }> {
    const existing = await prisma.orderOrigin.findMany({
      where: { branchId },
      select: { code: true },
    });
    const code = generateOrderOriginCode(
      name,
      existing.map((o) => o.code),
    );
    return { code };
  }

  async createOrderOrigin(branchId: string, dto: { name: string; code?: string }) {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Nome da origem é obrigatório');

    const existingCodes = (
      await prisma.orderOrigin.findMany({
        where: { branchId },
        select: { code: true },
      })
    ).map((o) => o.code);

    let code = (dto.code ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!code) {
      code = generateOrderOriginCode(name, existingCodes);
    }
    if (!isValidOrderOriginCode(code)) {
      throw new BadRequestException(
        'Código deve ter no mínimo 5 caracteres, apenas letras e números (a-z, 0-9), com ambos na mesma combinação.',
      );
    }
    if (existingCodes.some((c) => c.toLowerCase() === code)) {
      throw new BadRequestException('Já existe uma origem com este código');
    }

    return prisma.orderOrigin.create({
      data: { branchId, name, code },
    });
  }

  async updateOrderOrigin(
    branchId: string,
    id: string,
    dto: { name?: string; code?: string },
  ) {
    const existing = await prisma.orderOrigin.findFirst({ where: { id, branchId } });
    if (!existing) throw new NotFoundException('Origem não encontrada');

    const name = dto.name?.trim() ?? existing.name;
    let code = existing.code;
    if (dto.code !== undefined) {
      code = dto.code.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!isValidOrderOriginCode(code)) {
        throw new BadRequestException(
          'Código deve ter no mínimo 5 caracteres, apenas letras e números (a-z, 0-9), com ambos na mesma combinação.',
        );
      }
      const conflict = await prisma.orderOrigin.findFirst({
        where: { branchId, code, NOT: { id } },
      });
      if (conflict) throw new BadRequestException('Já existe uma origem com este código');
    }

    const updated = await prisma.orderOrigin.update({
      where: { id },
      data: { name, code },
    });

    await this.refreshCampaignLinksForOrigin(branchId, id);
    return updated;
  }

  async deleteOrderOrigin(branchId: string, id: string) {
    const existing = await prisma.orderOrigin.findFirst({ where: { id, branchId } });
    if (!existing) throw new NotFoundException('Origem não encontrada');

    const inUse = await prisma.orderChannelCampaign.count({
      where: { orderOriginId: id },
    });
    if (inUse > 0) {
      throw new BadRequestException(
        'Origem em uso por campanhas. Exclua ou altere as campanhas antes.',
      );
    }

    return prisma.orderOrigin.delete({ where: { id } });
  }

  private async refreshCampaignLinksForOrigin(branchId: string, orderOriginId: string) {
    const origin = await prisma.orderOrigin.findFirst({
      where: { id: orderOriginId, branchId },
    });
    if (!origin) return;

    const menuBaseUrl = await this.resolveBranchMenuBaseUrl(branchId);
    const linkUrl = buildOrderChannelCampaignLink({
      menuBaseUrl,
      originCode: origin.code,
    });

    await prisma.orderChannelCampaign.updateMany({
      where: { branchId, orderOriginId },
      data: { linkUrl, orderChannelCode: origin.code },
    });
  }

  private async requireOrderOrigin(branchId: string, orderOriginId: string) {
    const origin = await prisma.orderOrigin.findFirst({
      where: { id: orderOriginId, branchId },
    });
    if (!origin) throw new BadRequestException('Origem não encontrada');
    return origin;
  }

  /** E.164 Brasil: sempre 55 + DDD + número (ex.: 81982647352 → 5581982647352). */
  private normalizePhoneE164Brazil(phone: string): string {
    const raw = `${phone ?? ''}`.replace(/\D/g, '');
    if (raw.length < 10) return '';

    const normalized =
      normalizeBrazilPhone(raw) ||
      normalizeBrazilPhone(raw.startsWith('55') ? raw : `55${raw}`) ||
      '';

    if (normalized) return normalized;

    const with55 = raw.startsWith('55') ? raw : `55${raw}`;
    return with55.length >= 12 ? with55 : '';
  }

  private sanitizeOrderCampaignRecipients(
    recipients?: Array<{ customerId: string; name: string; phone: string }>,
  ): Prisma.InputJsonValue | undefined {
    if (recipients === undefined) return undefined;
    const list = recipients
      .map((r) => ({
        customerId: String(r.customerId ?? '').trim(),
        name: String(r.name ?? '').trim() || 'Sem nome',
        phone: this.normalizePhoneE164Brazil(String(r.phone ?? '')),
      }))
      .filter((r) => r.customerId && r.phone.length >= 12);
    return list as Prisma.InputJsonValue;
  }

  // ─── Campanhas de links de pedido ────────────────────────────────────────────

  private async resolveBranchMenuBaseUrl(branchId: string): Promise<string> {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { subdomain: true },
    });
    if (!branch) throw new NotFoundException('Filial não encontrada');
    const url = this.buildBranchOrdersMenuUrl(branch.subdomain ?? null);
    if (!url) {
      throw new BadRequestException(
        'Configure o subdomínio da filial e FRONTEND_URL para gerar links do cardápio.',
      );
    }
    return url;
  }

  async getOrderChannelCampaigns(branchId: string): Promise<OrderChannelCampaignListItem[]> {
    const rows = await prisma.orderChannelCampaign.findMany({
      where: { branchId },
      include: this.orderOriginInclude,
      orderBy: { dispatchedAt: 'desc' },
    });

    return rows.map((c) => this.toOrderChannelCampaignListItem(c));
  }

  private toOrderChannelCampaignListItem(
    c: OrderChannelCampaign & {
      orderOrigin?: { id: string; name: string; code: string } | null;
    },
  ): OrderChannelCampaignListItem {
    const parsedRecipients = parseOrderCampaignRecipientsJson(c.recipients);
    return {
      id: c.id,
      branchId: c.branchId,
      orderOriginId: c.orderOriginId,
      title: c.title,
      phoneNumber: c.phoneNumber,
      description: c.description,
      imageUrl: c.imageUrl,
      recipients: c.recipients,
      orderChannelCode: c.orderChannelCode,
      linkUrl: c.linkUrl,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      originNumber: c.orderOrigin?.code ?? c.orderChannelCode,
      originName: c.orderOrigin?.name ?? '',
      dispatchedAt: c.dispatchedAt ?? (parsedRecipients.length ? c.createdAt : null),
      recipientCount: c.recipientCount || parsedRecipients.length,
      processedCount: c.processedCount,
      sentCount: c.sentCount,
      readCount: c.readCount,
      failedCount: c.failedCount,
      orderOrigin: c.orderOrigin ?? undefined,
    };
  }

  private async findOrderChannelCampaignForResponse(campaignId: string, branchId: string) {
    const row = await prisma.orderChannelCampaign.findFirst({
      where: { id: campaignId, branchId },
      include: this.orderOriginInclude,
    });
    if (!row) throw new NotFoundException('Campanha não encontrada');
    return this.toOrderChannelCampaignListItem(row);
  }

  private async syncOrderChannelCampaignStats(campaignId: string): Promise<void> {
    const messages = await prisma.orderChannelCampaignMessage.findMany({
      where: { orderChannelCampaignId: campaignId },
      select: { status: true },
    });

    let processedCount = 0;
    let sentCount = 0;
    let readCount = 0;
    let failedCount = 0;

    for (const m of messages) {
      switch (m.status) {
        case 'processed':
          processedCount++;
          break;
        case 'sent':
          processedCount++;
          sentCount++;
          break;
        case 'read':
          processedCount++;
          sentCount++;
          readCount++;
          break;
        case 'failed':
          failedCount++;
          break;
        default:
          break;
      }
    }

    await prisma.orderChannelCampaign.update({
      where: { id: campaignId },
      data: {
        recipientCount: messages.length,
        processedCount,
        sentCount,
        readCount,
        failedCount,
      },
    });
  }

  /** Atualiza status da mensagem da campanha a partir do webhook Evolution. */
  async updateOrderChannelCampaignMessageFromEvolution(
    evolutionMessageId: string,
    rawStatus: number | string | null | undefined,
    opts?: { customerPhoneDigits?: string; attachIdIfMissing?: boolean },
  ): Promise<void> {
    if (!evolutionMessageId) return;

    const mapped = mapEvolutionAckToCampaignMessageStatus(rawStatus);
    if (!mapped || mapped === 'pending') return;

    let row = await prisma.orderChannelCampaignMessage.findUnique({
      where: { evolutionMessageId },
    });

    if (!row && opts?.customerPhoneDigits) {
      const digits =
        this.normalizePhoneE164Brazil(opts.customerPhoneDigits) ||
        opts.customerPhoneDigits.replace(/\D/g, '');
      const suffix = digits.slice(-9);
      if (suffix.length >= 8) {
        row = await prisma.orderChannelCampaignMessage.findFirst({
          where: {
            evolutionMessageId: null,
            status: { in: ['pending', 'processed', 'sent'] },
            customerPhone: { contains: suffix },
            createdAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (row && opts.attachIdIfMissing) {
          await prisma.orderChannelCampaignMessage.update({
            where: { id: row.id },
            data: { evolutionMessageId },
          });
        }
      }
    }

    if (!row) return;

    if (!shouldAdvanceCampaignMessageStatus(row.status, mapped)) return;

    const data: {
      status: OrderChannelCampaignMessageStatus;
      sentAt?: Date;
      readAt?: Date;
    } = { status: mapped };

    if (mapped === 'sent' && !row.sentAt) data.sentAt = new Date();
    if (mapped === 'read') {
      if (!row.sentAt) data.sentAt = new Date();
      data.readAt = new Date();
    }

    await prisma.orderChannelCampaignMessage.update({
      where: { id: row.id },
      data,
    });

    await this.syncOrderChannelCampaignStats(row.orderChannelCampaignId);
  }

  /** Variantes com 55 (e com/sem 9º dígito) para Evolution. */
  private buildEvolutionSendNumberCandidates(phone: string): string[] {
    const primary = this.normalizePhoneE164Brazil(phone);
    if (!primary) return [];

    const out: string[] = [];
    const seen = new Set<string>();
    const push = (digits: string) => {
      const d = digits.replace(/\D/g, '');
      if (!d.startsWith('55') || d.length < 12 || d.length > 13 || seen.has(d)) return;
      seen.add(d);
      out.push(d);
    };

    push(primary);
    const alt = this.formatPhoneAlternative(primary);
    if (alt) push(alt);

    return out;
  }

  /** Garante 55 no `number` da Evolution (com ou sem sufixo @s.whatsapp.net). */
  private toEvolutionSendNumber(target: string): string {
    const t = target.trim();
    if (!t) return t;
    if (t.includes('@')) return t;

    const d = t.replace(/\D/g, '');
    if (d.startsWith('55') && d.length >= 12) return d;
    if (d.length >= 10) return this.normalizePhoneE164Brazil(d) || `55${d}`;
    return d;
  }

  private isEvolutionExistsFalseError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return msg.includes('"exists":false') || msg.includes("'exists':false");
  }

  /** JID usado em conversas anteriores (CRM) — inclui @lid quando aplicável. */
  private async findKnownCustomerRemoteJid(
    branchId: string,
    customerId: string,
    phone: string,
  ): Promise<string | null> {
    const byCustomer = await prisma.whatsAppMessage.findFirst({
      where: {
        branchId,
        customerId,
        remoteJid: { not: '' },
      },
      orderBy: { sentAt: 'desc' },
      select: { remoteJid: true },
    });
    if (byCustomer?.remoteJid && !isGroupJid(byCustomer.remoteJid)) {
      return byCustomer.remoteJid;
    }

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, branchId },
      select: { phone: true },
    });

    const formatted = this.normalizePhoneE164Brazil(phone) || this.formatPhone(phone);
    const alt = this.formatPhoneAlternative(formatted);
    const localDigits = phone.replace(/\D/g, '').replace(/^55/, '');
    const phoneKeys = [
      formatted,
      alt,
      customer?.phone ? this.normalizePhoneE164Brazil(customer.phone) : '',
      phone.replace(/\D/g, ''),
      localDigits,
    ].filter(Boolean) as string[];

    const byPhone = await prisma.whatsAppMessage.findMany({
      where: {
        branchId,
        remoteJid: { not: '' },
        OR: [
          ...phoneKeys.map((p) => ({ customerPhone: p })),
          ...phoneKeys.map((p) => ({
            remoteJid: { contains: p.replace(/\D/g, '').slice(-10) },
          })),
        ],
      },
      orderBy: { sentAt: 'desc' },
      take: 20,
      select: { remoteJid: true, customerPhone: true },
    });

    for (const row of byPhone) {
      if (!row.remoteJid || isGroupJid(row.remoteJid)) continue;
      if (phoneKeys.some((p) => phonesMatch(row.customerPhone || '', p))) {
        return row.remoteJid;
      }
      const jidDigits = phoneFromJid(row.remoteJid).replace(/\D/g, '');
      if (phoneKeys.some((p) => phonesMatch(jidDigits, p))) {
        return row.remoteJid;
      }
    }

    return null;
  }

  /**
   * Destinos para sendText (prioriza @lid do CRM/mapa; depois número validado na Evolution).
   * A Evolution v2 rejeita @s.whatsapp.net com exists:false quando o contato só existe como @lid.
   */
  private async resolveOrderCampaignSendTargets(
    branchId: string,
    instanceName: string,
    customerId: string,
    phone: string,
    lidMap: Map<string, string>,
  ): Promise<string[]> {
    const targets: string[] = [];
    const seen = new Set<string>();
    const push = (value?: string | null) => {
      const v = `${value ?? ''}`.trim();
      if (!v || isGroupJid(v) || seen.has(v)) return;
      seen.add(v);
      targets.push(v);
    };

    push(await this.findKnownCustomerRemoteJid(branchId, customerId, phone));

    const digitCandidates = this.buildEvolutionSendNumberCandidates(phone);
    for (const digits of digitCandidates) {
      const phoneJid = `${digits}@s.whatsapp.net`;
      for (const jid of this.expandBrazilPhoneJids(phoneJid)) {
        push(jid);
        push(lidMap.get(jid));
        push(resolveJidWithMap(jid, lidMap));
      }
    }

    if (digitCandidates.length) {
      try {
        const res = await this.evolutionRequest('POST', `/chat/whatsappNumbers/${instanceName}`, {
          numbers: digitCandidates,
        });
        const list = (Array.isArray(res) ? res : []) as Array<{
          exists?: boolean;
          jid?: string;
          number?: string;
        }>;
        for (const row of list) {
          if (!row?.exists) continue;
          if (row.jid) push(row.jid);
          if (row.number) {
            push(row.number.includes('@') ? row.number : `${row.number.replace(/\D/g, '')}@s.whatsapp.net`);
          }
        }
      } catch (err) {
        this.logger.warn(
          `[resolveOrderCampaignSendTargets] whatsappNumbers falhou: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return targets.sort((a, b) => {
      const rank = (j: string) => (isLidJid(j) ? 0 : isPhoneJid(j) ? 1 : 2);
      return rank(a) - rank(b);
    });
  }

  /** Envia texto pela instância WhatsApp conectada da filial (remetente = Evolution instance). */
  private async sendTextViaConnectedInstance(
    branchId: string,
    instanceName: string,
    phone: string,
    text: string,
    meta?: {
      customerId?: string;
      customerName?: string;
      lidMap?: Map<string, string>;
      campaignMessageId?: string;
    },
  ): Promise<{ evolutionMessageId: string | null; storedPhone: string }> {
    const targets =
      meta?.customerId && meta.lidMap
        ? await this.resolveOrderCampaignSendTargets(
            branchId,
            instanceName,
            meta.customerId,
            phone,
            meta.lidMap,
          )
        : [];

    if (!targets.length) {
      const fallbackDigits = this.buildEvolutionSendNumberCandidates(phone);
      for (const d of fallbackDigits) {
        targets.push(`${d}@s.whatsapp.net`, d);
      }
    }

    if (!targets.length) {
      throw new BadRequestException(`Telefone inválido: ${phone}`);
    }

    let lastError: unknown;
    for (const target of targets) {
      const number = this.toEvolutionSendNumber(target);
      try {
        const apiResult = await this.evolutionRequest('POST', `/message/sendText/${instanceName}`, {
          number,
          text,
        });
        const evolutionMessageId = this.extractEvolutionMessageId(apiResult);
        const storedPhone = number.includes('@')
          ? phoneFromJid(number) || this.formatPhone(phone)
          : number;

        if (meta?.campaignMessageId) {
          await prisma.orderChannelCampaignMessage.update({
            where: { id: meta.campaignMessageId },
            data: {
              evolutionMessageId: evolutionMessageId ?? undefined,
              status: evolutionMessageId ? 'sent' : 'processed',
              sentAt: new Date(),
              errorMessage: null,
            },
          });
        }

        await this.recordMessage({
          branchId,
          customerId: meta?.customerId,
          customerName: meta?.customerName,
          phone: storedPhone,
          text,
          status: 'sent',
          remoteJid: number.includes('@') ? number : undefined,
        });
        return { evolutionMessageId, storedPhone };
      } catch (err) {
        lastError = err;
        if (!this.isEvolutionExistsFalseError(err)) {
          this.logger.warn(
            `[sendTextViaConnectedInstance] Falha (${instanceName} → ${number}): ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    }

    const failPhone = this.formatPhone(phone);
    const failMsg =
      lastError instanceof Error
        ? lastError.message
        : String(lastError ?? 'Falha ao enviar');

    if (meta?.campaignMessageId) {
      await prisma.orderChannelCampaignMessage.update({
        where: { id: meta.campaignMessageId },
        data: { status: 'failed', errorMessage: failMsg.slice(0, 500) },
      });
    }

    await this.recordMessage({
      branchId,
      customerId: meta?.customerId,
      customerName: meta?.customerName,
      phone: failPhone,
      text,
      status: 'failed',
    });
    const tried = this.buildEvolutionSendNumberCandidates(phone).join(', ') || '—';
    throw new BadRequestException(
      `Número sem WhatsApp ativo ou inválido (${phone}). Formatos tentados (com 55): ${tried}. Abra o chat no CRM com esse cliente antes.`,
    );
  }

  private async dispatchOrderChannelCampaignMessages(
    branchId: string,
    campaign: OrderChannelCampaign & {
      orderOrigin?: { name: string; code: string } | null;
    },
  ): Promise<OrderChannelCampaignDispatchResult | null> {
    const template = campaign.description?.trim();
    if (!template) return null;

    const recipients = parseOrderCampaignRecipientsJson(campaign.recipients);
    if (!recipients.length) return null;

    const config = await this.requireConnectedConfig(branchId);
    const lidMap = await this.buildLidMap(
      config.instanceName!,
      [],
      this.connectedInstancePhone(config),
    );

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { branchName: true },
    });
    const branchName = branch?.branchName || branch?.branchName || '';

    let origin = campaign.orderOrigin;
    if (!origin) {
      origin = await prisma.orderOrigin.findFirst({
        where: { id: campaign.orderOriginId, branchId },
        select: { name: true, code: true },
      });
    }

    const ctx = {
      menuLink: campaign.linkUrl,
      originName: origin?.name,
      originCode: origin?.code,
      campaignTitle: campaign.title,
      branchName,
    };

    this.logger.log(
      `[dispatchOrderChannelCampaign] branch=${branchId} instance=${config.instanceName} recipients=${recipients.length}`,
    );

    await prisma.orderChannelCampaign.update({
      where: { id: campaign.id },
      data: {
        dispatchedAt: new Date(),
        recipientCount: recipients.length,
      },
    });

    const dispatchRows = await Promise.all(
      recipients.map((recipient) =>
        prisma.orderChannelCampaignMessage.create({
          data: {
            orderChannelCampaignId: campaign.id,
            customerId: recipient.customerId,
            customerName: recipient.name,
            customerPhone: recipient.phone,
            status: 'pending',
          },
        }),
      ),
    );

    const result: OrderChannelCampaignDispatchResult = { sent: 0, failed: 0, errors: [] };

    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      const dispatchRow = dispatchRows[i];
      const text = substituteOrderCampaignMessage(template, ctx, recipient);
      try {
        await this.sendTextViaConnectedInstance(
          branchId,
          config.instanceName!,
          recipient.phone,
          text,
          {
            customerId: recipient.customerId,
            customerName: recipient.name,
            lidMap,
            campaignMessageId: dispatchRow.id,
          },
        );
        result.sent++;
      } catch (err: unknown) {
        result.failed++;
        const msg = err instanceof Error ? err.message : String(err);
        const tried = this.buildEvolutionSendNumberCandidates(recipient.phone).join(', ');
        result.errors.push(`${recipient.phone}: ${msg}`);
        this.logger.error(
          `[dispatchOrderChannelCampaign] Falha para ${recipient.phone} (${recipient.name}): ${msg}` +
            (tried ? ` | com 55: ${tried}` : ''),
        );
      }
      await this.delayMs(600);
    }

    await this.syncOrderChannelCampaignStats(campaign.id);

    return result;
  }

  async createOrderChannelCampaign(
    branchId: string,
    dto: {
      title: string;
      phoneNumber: string;
      orderOriginId: string;
      description?: string;
      imageUrl?: string;
      recipients?: Array<{ customerId: string; name: string; phone: string }>;
    },
  ): Promise<OrderChannelCampaignSaveResponse> {
    const recipients = this.sanitizeOrderCampaignRecipients(dto.recipients);
    if (dto.description?.trim() && Array.isArray(recipients) && recipients.length > 0) {
      await this.requireConnectedConfig(branchId);
    }

    const origin = await this.requireOrderOrigin(branchId, dto.orderOriginId);

    const menuBaseUrl = await this.resolveBranchMenuBaseUrl(branchId);
    const linkUrl = buildOrderChannelCampaignLink({
      menuBaseUrl,
      originCode: origin.code,
    });

    const campaign = await prisma.orderChannelCampaign.create({
      data: {
        branchId,
        orderOriginId: origin.id,
        title: dto.title.trim(),
        phoneNumber: dto.phoneNumber.trim(),
        description: dto.description?.trim() || null,
        imageUrl: dto.imageUrl?.trim() || null,
        recipients,
        orderChannelCode: origin.code,
        linkUrl,
      },
      include: this.orderOriginInclude,
    });

    const dispatch = await this.dispatchOrderChannelCampaignMessages(branchId, campaign);
    const item = await this.findOrderChannelCampaignForResponse(campaign.id, branchId);
    return { ...item, dispatch };
  }

  async bulkCreateOrderChannelCampaigns(
    branchId: string,
    dto: {
      title: string;
      phoneNumber: string;
      description?: string;
      imageUrl?: string;
      recipients?: Array<{ customerId: string; name: string; phone: string }>;
    },
  ) {
    const origins = await prisma.orderOrigin.findMany({
      where: { branchId },
      select: { id: true },
    });
    if (!origins.length) {
      throw new BadRequestException('Cadastre ao menos uma origem antes de gerar campanhas em lote.');
    }

    const results: OrderChannelCampaignSaveResponse[] = [];
    for (const { id } of origins) {
      results.push(
        await this.createOrderChannelCampaign(branchId, {
          ...dto,
          orderOriginId: id,
        }),
      );
    }
    return results;
  }

  async updateOrderChannelCampaign(
    branchId: string,
    id: string,
    dto: {
      title?: string;
      phoneNumber?: string;
      orderOriginId?: string;
      description?: string;
      imageUrl?: string;
      recipients?: Array<{ customerId: string; name: string; phone: string }>;
    },
  ): Promise<OrderChannelCampaignSaveResponse> {
    const existing = await prisma.orderChannelCampaign.findFirst({
      where: { id, branchId },
    });
    if (!existing) throw new NotFoundException('Campanha não encontrada');

    const nextDescription =
      dto.description !== undefined ? dto.description.trim() : existing.description?.trim();
    const nextRecipientsRaw =
      dto.recipients !== undefined
        ? this.sanitizeOrderCampaignRecipients(dto.recipients)
        : existing.recipients;
    const nextRecipientCount = parseOrderCampaignRecipientsJson(nextRecipientsRaw).length;
    if (nextDescription && nextRecipientCount > 0) {
      await this.requireConnectedConfig(branchId);
    }

    const origin = dto.orderOriginId
      ? await this.requireOrderOrigin(branchId, dto.orderOriginId)
      : await this.requireOrderOrigin(branchId, existing.orderOriginId);

    const phoneNumber = dto.phoneNumber ?? existing.phoneNumber;
    const title = dto.title?.trim() ?? existing.title;

    const menuBaseUrl = await this.resolveBranchMenuBaseUrl(branchId);
    const linkUrl = buildOrderChannelCampaignLink({
      menuBaseUrl,
      originCode: origin.code,
    });

    const description =
      dto.description !== undefined ? dto.description.trim() || null : existing.description;
    const imageUrl =
      dto.imageUrl !== undefined ? dto.imageUrl.trim() || null : existing.imageUrl;
    const recipients =
      dto.recipients !== undefined
        ? this.sanitizeOrderCampaignRecipients(dto.recipients)
        : undefined;

    const campaign = await prisma.orderChannelCampaign.update({
      where: { id },
      data: {
        title,
        phoneNumber,
        orderOriginId: origin.id,
        orderChannelCode: origin.code,
        description,
        imageUrl,
        recipients,
        linkUrl,
      },
      include: this.orderOriginInclude,
    });

    const dispatch = await this.dispatchOrderChannelCampaignMessages(branchId, campaign);
    const item = await this.findOrderChannelCampaignForResponse(campaign.id, branchId);
    return { ...item, dispatch };
  }

  async deleteOrderChannelCampaign(branchId: string, id: string) {
    const existing = await prisma.orderChannelCampaign.findFirst({
      where: { id, branchId },
    });
    if (!existing) throw new NotFoundException('Campanha não encontrada');
    return prisma.orderChannelCampaign.delete({ where: { id } });
  }

  private mapCampaignMessageDisplayStatus(
    status: string,
  ): { status: OrderChannelCampaignMessageDisplayStatus; statusLabel: string } {
    if (status === 'failed') {
      return { status: 'failed', statusLabel: 'Falhou' };
    }
    if (status === 'pending') {
      return { status: 'pending', statusLabel: 'Aguardando' };
    }
    return { status: 'sent', statusLabel: 'Enviado' };
  }

  private toOrderChannelCampaignMessageListItem(row: {
    id: string;
    customerId: string | null;
    customerName: string | null;
    customerPhone: string;
    status: string;
    sentAt: Date | null;
    readAt: Date | null;
    errorMessage: string | null;
  }): OrderChannelCampaignMessageListItem {
    const mapped = this.mapCampaignMessageDisplayStatus(row.status);
    return {
      id: row.id,
      customerId: row.customerId,
      name: row.customerName?.trim() || 'Sem nome',
      phone: row.customerPhone,
      status: mapped.status,
      statusLabel: mapped.statusLabel,
      sentAt: row.sentAt,
      readAt: row.readAt,
      errorMessage: row.errorMessage,
    };
  }

  async getOrderChannelCampaignDashboard(
    branchId: string,
    campaignId: string,
  ): Promise<OrderChannelCampaignDashboardResponse> {
    const campaign = await prisma.orderChannelCampaign.findFirst({
      where: { id: campaignId, branchId },
      include: this.orderOriginInclude,
    });
    if (!campaign) throw new NotFoundException('Campanha não encontrada');

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { branchName: true },
    });

    const template = campaign.description?.trim() ?? '';
    let messagePreview: string | null = null;

    if (template) {
      const recipients = parseOrderCampaignRecipientsJson(campaign.recipients);
      const sample = recipients[0] ?? {
        customerId: '',
        name: 'Cliente',
        phone: campaign.phoneNumber,
      };
      messagePreview = substituteOrderCampaignMessage(
        template,
        {
          menuLink: campaign.linkUrl,
          originName: campaign.orderOrigin?.name,
          originCode: campaign.orderOrigin?.code ?? campaign.orderChannelCode,
          campaignTitle: campaign.title,
          branchName: branch?.branchName ?? '',
        },
        sample,
      );
    }

    return {
      campaign: this.toOrderChannelCampaignListItem(campaign),
      messagePreview,
    };
  }

  async getOrderChannelCampaignMessages(
    branchId: string,
    campaignId: string,
    query: { page?: number; limit?: number; search?: string },
  ): Promise<PaginatedResponseDto<OrderChannelCampaignMessageListItem>> {
    const exists = await prisma.orderChannelCampaign.findFirst({
      where: { id: campaignId, branchId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Campanha não encontrada');

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();

    const where: Prisma.OrderChannelCampaignMessageWhereInput = {
      orderChannelCampaignId: campaignId,
    };

    if (search) {
      const digits = search.replace(/\D/g, '');
      where.OR = [
        { customerName: { contains: search, mode: 'insensitive' } },
        ...(digits ? [{ customerPhone: { contains: digits } }] : []),
      ];
    }

    let total = await prisma.orderChannelCampaignMessage.count({ where });

    if (total === 0 && !search) {
      const campaign = await prisma.orderChannelCampaign.findFirst({
        where: { id: campaignId, branchId },
        select: { recipients: true },
      });
      const legacy = parseOrderCampaignRecipientsJson(campaign?.recipients ?? null);
      if (legacy.length) {
        const start = (page - 1) * limit;
        const slice = legacy.slice(start, start + limit);
        const data: OrderChannelCampaignMessageListItem[] = slice.map((r, idx) => ({
          id: `legacy-${start + idx}-${r.customerId}`,
          customerId: r.customerId,
          name: r.name,
          phone: r.phone,
          status: 'pending',
          statusLabel: 'Aguardando',
          sentAt: null,
          readAt: null,
          errorMessage: null,
        }));
        return new PaginatedResponseDto(data, legacy.length, page, limit);
      }
    }

    const rows = await prisma.orderChannelCampaignMessage.findMany({
      where,
      orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    });

    const data = rows.map((row) => this.toOrderChannelCampaignMessageListItem(row));
    return new PaginatedResponseDto(data, total, page, limit);
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

  /** Telefone da instância conectada (`WhatsAppConfig.phoneNumber`). */
  private connectedInstancePhone(config: { phoneNumber?: string | null }): string | null {
    return config.phoneNumber ?? null;
  }

  /** ID da mensagem no payload da Evolution (resposta do envio ou webhook). */
  private extractEvolutionMessageId(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null;
    const p = payload as Record<string, unknown>;
    const key = p.key as Record<string, unknown> | undefined;
    const nestedMsg = p.message as Record<string, unknown> | undefined;
    const nestedKey = nestedMsg?.key as Record<string, unknown> | undefined;
    const update = p.update as Record<string, unknown> | undefined;
    const updateKey = update?.key as Record<string, unknown> | undefined;

    for (const c of [key?.id, updateKey?.id, p.messageId, p.keyId, p.id, nestedKey?.id]) {
      if (typeof c === 'string' && c.trim()) return c.trim();
    }
    return null;
  }

  /** Atualiza número/perfil da instância após conexão (webhook ou polling). */
  async refreshInstanceProfileByBranchId(branchId: string, connectionPayload?: unknown) {
    const config = await prisma.whatsAppConfig.findFirst({ where: { branchId } });
    if (!config?.instanceName) return;

    const state =
      (connectionPayload as any)?.state ??
      (connectionPayload as any)?.instance?.state ??
      (connectionPayload as any)?.status;

    if (state && state !== 'open') return;

    await this.syncInstanceProfileFromEvolution(config, connectionPayload);

    if (config.status !== 'connected') {
      await prisma.whatsAppConfig.update({
        where: { id: config.id },
        data: { status: 'connected', qrCode: null },
      });
    }
  }

  /** Sincroniza número e perfil da instância Evolution quando conectada. */
  private async syncInstanceProfileFromEvolution(
    config: {
      id: string;
      instanceName: string | null;
      phoneNumber: string | null;
      profileName: string | null;
      profilePicUrl: string | null;
    },
    connectionStateRes?: unknown,
  ): Promise<{
    phoneNumber: string | null;
    profileName: string | null;
    profilePicUrl: string | null;
  }> {
    if (!config.instanceName) {
      return {
        phoneNumber: config.phoneNumber,
        profileName: config.profileName,
        profilePicUrl: config.profilePicUrl,
      };
    }

    try {
      let phone = this.extractInstancePhoneDigits(connectionStateRes);
      let profileName =
        (connectionStateRes as any)?.instance?.profileName ??
        (connectionStateRes as any)?.profileName ??
        null;
      let profilePicUrl =
        (connectionStateRes as any)?.instance?.profilePicUrl ??
        (connectionStateRes as any)?.profilePicUrl ??
        null;

      if (!phone) {
        const instances = await this.evolutionRequest('GET', '/instance/fetchInstances').catch(() => []);
        const list = Array.isArray(instances) ? instances : [];
        const row = list.find((item: any) => {
          const name = item?.instance?.instanceName ?? item?.instanceName ?? item?.name;
          return name === config.instanceName;
        });
        const inst = row?.instance ?? row;
        phone = this.extractInstancePhoneDigits(inst);
        profileName = profileName ?? inst?.profileName ?? inst?.profile?.name ?? null;
        profilePicUrl =
          profilePicUrl ?? inst?.profilePicUrl ?? inst?.profilePictureUrl ?? null;
      }

      const data: Record<string, string> = {};
      if (phone && phone !== config.phoneNumber) data.phoneNumber = phone;
      if (profileName && profileName !== config.profileName) data.profileName = profileName;
      if (profilePicUrl && profilePicUrl !== config.profilePicUrl) data.profilePicUrl = profilePicUrl;

      if (Object.keys(data).length > 0) {
        await prisma.whatsAppConfig.update({ where: { id: config.id }, data });
      }

      return {
        phoneNumber: phone ?? config.phoneNumber,
        profileName: profileName ?? config.profileName,
        profilePicUrl: profilePicUrl ?? config.profilePicUrl,
      };
    } catch (err: any) {
      this.logger.warn(`[syncInstanceProfile] ${err?.message ?? err}`);
      return {
        phoneNumber: config.phoneNumber,
        profileName: config.profileName,
        profilePicUrl: config.profilePicUrl,
      };
    }
  }

  private extractInstancePhoneDigits(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null;
    const root = payload as Record<string, unknown>;
    const inst = (root.instance as Record<string, unknown> | undefined) ?? root;
    const ownerRaw = inst.owner ?? inst.wuid ?? inst.number ?? root.owner ?? root.wuid;
    if (!ownerRaw) return null;

    const raw = String(ownerRaw);
    if (raw.includes('@')) {
      const fromJid = phoneFromJid(raw);
      return fromJid ? fromJid.replace(/\D/g, '') : null;
    }

    const digits = raw.replace(/\D/g, '');
    return digits.length >= 10 ? digits : null;
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
    remoteJid?: string;
  }) {
    try {
      const remoteJid =
        params.remoteJid?.trim() ||
        (params.phone.includes('@') ? params.phone : `${params.phone.replace(/\D/g, '')}@s.whatsapp.net`);
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
          remoteJid,
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