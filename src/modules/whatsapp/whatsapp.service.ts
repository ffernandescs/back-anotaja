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
import {  normalizeBrazilPhone } from 'src/utils/normalizePhone';
import { isGroupJid, safeMessageId } from 'src/utils/reutilizeWhatsapp';

/**
 * Prefixo usado ao criar instâncias na Evolution API.
 * Deve ser idêntico ao usado em resolveBranchId() do webhook controller.
 */
const INSTANCE_PREFIX = 'anotaja_';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(private readonly uploadService: UploadService) {}

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

  // Limpa unreads
  await prisma.whatsAppChatRead.deleteMany({ where });

  // Limpa mensagens com @lid e @g.us (lixo do WhatsApp)
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

  // Busca os JIDs sujos das mensagens que sobraram
  // e limpa o chatLastMessage por remoteJid (não tem branchId)
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

      return { status, phoneNumber: config.phoneNumber, profileName: config.profileName, profilePicUrl: config.profilePicUrl };
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

  // ─── CRM ─────────────────────────────────────────────────────────────────────

  /**
   * Lista conversas paginadas com última mensagem, cliente e resumo de pedidos.
   *
   * Fonte de dados:
   *   - Chats:        Evolution API (lista de conversas ativas)
   *   - LastMessage:  ChatLastMessage (banco local, populado pelo webhook)
   *   - Customer:     Customer (banco local)
   *   - Orders:       Order (banco local)
   *
   * Paginação: feita localmente após filtrar grupos.
   */
async fetchChats(branchId: string) {
  const config = await this.requireFullConfig(branchId);

  // 1. Busca todos os chats na Evolution API
  const rawChats = await this.evolutionRequest(
    'POST',
    `/chat/findChats/${config.instanceName}`,
    { where: {} },
  )
    .then((r) => (Array.isArray(r) ? r : r?.data ?? []))
    .catch(() => [] as any[]);

  // 2. Remove grupos e ordena por atualização
 // 2. Remove grupos, @lid e ordena por atualização
const chats = rawChats
  .filter((c: any) => {
    const jid = String(c.remoteJid ?? '');
    return !jid.endsWith('@g.us') && !jid.endsWith('@lid');
  })
  const jids: string[] = chats.map((c: any) => c.remoteJid as string);

  // 3. Últimas mensagens
  const lastMessages = await prisma.chatLastMessage.findMany({
    where: {
      branchId,
      remoteJid: { in: jids },
    },
  });

  const lastMsgByJid = new Map(lastMessages.map((m) => [m.remoteJid, m]));

  // 4. Monta mapa de jid → telefone sem 55 (formato salvo no banco)
  //    Ex: "5581912345678@s.whatsapp.net" → "81912345678"
  const jidToPhone = new Map<string, string>();

  for (const jid of jids) {
    const normalized = normalizeBrazilPhone(jid); // retorna string ou null/undefined
    if (normalized) {
      const withoutCountryCode = normalized.replace(/^55/, '');
      jidToPhone.set(jid, withoutCountryCode);
    } else {
      // fallback: tira apenas o sufixo do JID
      const fallback = jid.replace('@s.whatsapp.net', '').replace(/^55/, '');
      jidToPhone.set(jid, fallback);
    }
  }

  const phonesWithout55 = Array.from(new Set(jidToPhone.values()));

  // 5. Clientes pelo telefone sem 55
  const customers = await prisma.customer.findMany({
    where: {
      branchId,
      phone: { in: phonesWithout55 },
    },
  });

  // Map: telefone sem 55 → customer
  const customerByPhone = new Map(customers.map((c) => [c.phone, c]));

  // 6. Pedidos dos clientes encontrados
  const customerIds = customers.map((c) => c.id);

  const orders = customerIds.length
    ? await prisma.order.findMany({
        where: {
          branchId,
          customerId: { in: customerIds },
        },
        orderBy: { createdAt: 'desc' },
      })
    : [];

  // Map: customerId → Order[]
  const ordersByCustomer = new Map<string, typeof orders>();

  for (const order of orders) {
    if (!order.customerId) continue;
    const list = ordersByCustomer.get(order.customerId) ?? [];
    list.push(order);
    ordersByCustomer.set(order.customerId, list);
  }

  // 7. Mensagens não lidas
  const unreadRows = await prisma.whatsAppChatRead.findMany({
    where: {
      branchId,
      jid: { in: jids },
    },
  });

  const unreadByJid = new Map(unreadRows.map((r) => [r.jid, r.unreadCount]));

  // 8. Montagem final
  const result = chats.map((chat: any) => {
    const jid: string = chat.remoteJid;

    // Telefone sem 55, igual ao formato do banco
    const phone = jidToPhone.get(jid) ?? jid.replace('@s.whatsapp.net', '');

    const customer = customerByPhone.get(phone) ?? null;

    const customerOrders = customer
      ? (ordersByCustomer.get(customer.id) ?? [])
      : [];

    const last = lastMsgByJid.get(jid) ?? null;
    const unreadCount = unreadByJid.get(jid) ?? 0;

    return {
      id: jid,
      remoteJid: jid,
      phone,
      pushName: chat.pushName ?? null,
      profilePicUrl: chat.profilePicUrl ?? null,
      updatedAt: chat.updatedAt ?? null,
      unreadCount,

      lastMessage: last
        ? {
            id: last.messageId,
            text: last.text ?? '',
            timestamp: Number(last.timestamp),
            fromMe: last.fromMe,
            pushName: last.pushName ?? null,
          }
        : null,

      customer,
      ordersSummary: this.summarizeOrders(customerOrders),
      totalOrders: customerOrders.length,
    };
  });

  // 9. Resumo global
  const globalSummary = {
    new: orders.filter((o) => o.status === 'PENDING').length,
    pending: orders.filter((o) =>
      ['CONFIRMED', 'IN_PROGRESS'].includes(o.status),
    ).length,
    outForDelivery: orders.filter((o) =>
      ['READY', 'DELIVERING'].includes(o.status),
    ).length,
    completed: orders.filter((o) =>
      ['DELIVERED', 'COMPLETED'].includes(o.status),
    ).length,
  };

  return {
    chats: result,
    globalSummary,
    total: chats.length,
  };
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

  if (!config?.instanceName) return [];

  // 📡 busca mensagens diretamente (SEM limit, SEM cursor)
  const raw = await this.evolutionRequest(
    'POST',
    `/chat/findMessages/${config.instanceName}`,
    {
      where: {
        key: {
          remoteJid: jid,
        },
      },
    },
  );

  const messages = this.extractMessages(raw);

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
  return cleaned.map((msg: any) => ({
    id: safeMessageId(msg),
    fromMe: msg?.key?.fromMe ?? false,
    text: this.extractText(msg) ?? '',
    timestamp: this.toMs(msg?.messageTimestamp),
    status: this.mapStatus(msg?.status),
    mediaType: this.detectMediaType(msg),
    mediaUrl: this.extractMediaUrl(msg),
    pushName: msg?.pushName ?? null,
  }));
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

  async markChatAsRead(branchId?: string, partnerId?: string, jid?: string) {
    // WhatsAppChatRead usa branchId da config (id), não branchId da branch
    if (!branchId) return { success: true };

    try {
      const config = await prisma.whatsAppConfig.findUnique({ where: { branchId } });
      if (!config) return { success: true };

      await prisma.whatsAppChatRead.upsert({
        where: { branchId_jid: { branchId: config.id, jid: jid ?? '' } },
        create: { branchId: config.id, jid: jid ?? '', unreadCount: 0, lastReadAt: new Date() },
        update: { unreadCount: 0, lastReadAt: new Date() },
      });
    } catch (err) {
      this.logger.warn('[markChatAsRead] Falhou silenciosamente:', err);
    }

    return { success: true };
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