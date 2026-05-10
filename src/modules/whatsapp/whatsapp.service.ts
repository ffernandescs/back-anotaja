import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { OrderStateMachineService } from '../store/store-state-machine.service';

@Injectable()
export class WhatsAppService {
  private logger = new Logger(WhatsAppService.name);
  private orderStateMachine = new OrderStateMachineService();

  constructor(
    private uploadService: UploadService,
  ) {}

  private get serverUrl(): string {
    const url = process.env.EVOLUTION_API_URL;
    if (!url) throw new BadRequestException('EVOLUTION_API_URL nao configurada');
    return url.replace(/\/+$/, '');
  }

  private get globalApiKey(): string {
    const key = process.env.EVOLUTION_API_KEY;
    if (!key) throw new BadRequestException('EVOLUTION_API_KEY nao configurada');
    return key;
  }

  private async ensureInstance(instanceName: string) {
  try {
    // 1. tenta verificar se existe
    const state = await this.evolutionRequest(
      'GET',
      `/instance/connectionState/${instanceName}`,
    );

    if (state?.instance?.state === 'open') {
      return { exists: true, connected: true };
    }

    return { exists: true, connected: false };
  } catch (err: any) {
    // 404 = não existe
    if (err?.status === 404 || err?.message?.includes('does not exist')) {
      return { exists: false, connected: false };
    }

    // outros erros → deixa passar mas loga
    this.logger.warn('[WhatsApp] ensureInstance error:', err);
    return { exists: false, connected: false };
  }
}

  private async checkWhatsAppNumber(
    instanceName: string,
    phone: string,
  ): Promise<boolean> {
    try {
      const res = await this.evolutionRequest(
        'POST',
        `/chat/whatsappNumbers/${instanceName}`,
        {
          numbers: [phone],
        },
      );

      const result = Array.isArray(res) ? res[0] : res?.[0];

      return !!result?.exists;
    } catch (error) {
      this.logger.warn(
        `[WhatsApp] Falha ao verificar número ${phone}: ${error}`,
      );

      // Se falhar na API, deixa tentar enviar normalmente
      return true;
    }
  }

  private async resolveWhatsAppNumber(
    instanceName: string,
    phone: string,
  ): Promise<string | null> {
    const primary = this.formatPhone(phone);
    const alternative = this.formatPhoneAlternative(primary);

    const primaryExists = await this.checkWhatsAppNumber(
      instanceName,
      primary,
    );

    if (primaryExists) {
      return primary;
    }

    if (alternative) {
      const altExists = await this.checkWhatsAppNumber(
        instanceName,
        alternative,
      );

      if (altExists) {
        return alternative;
      }
    }

    return null;
  }
  // ─── Monitor Instance Connection ──────────────────────────────────

  private monitorInstanceConnection(branchId: string, instanceName: string) {
    const maxAttempts = 60;
    let attempts = 0;

    const checkConnection = async () => {
      if (attempts >= maxAttempts) {
        return;
      }

      attempts++;

      try {
        const status = await this.getStatus(branchId);
        
        if (status.status === 'connected') {
          await this.fetchChats(branchId);
          return;
        }

        setTimeout(checkConnection, 10000);
      } catch (error) {
        console.error('[WhatsApp] Error checking instance connection:', error);
        setTimeout(checkConnection, 10000);
      }
    };

    setTimeout(checkConnection, 5000);
  }

  // ─── Config CRUD ──────────────────────────────────────────────

  async getConfig(branchId: string) {
    const config = await prisma.whatsAppConfig.findUnique({
      where: { branchId },
    });

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

    return {
      ...config,
      serverUrl: undefined,
      apiKey: undefined,
    };
  }

  async updateConfig(branchId: string, dto: UpdateWhatsAppConfigDto) {
    return prisma.whatsAppConfig.upsert({
      where: { branchId },
      update: dto,
      create: { branchId, ...dto },
    });
  }

  
private sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
  // ─── Evolution API – Instance management ──────────────────────

// ─────────────────────────────────────────────────────────────
// WHATSAPP SETUP — EVOLUTION API v2.2.x (CORRIGIDO)
// Fluxo correto:
// 1. remove instância antiga
// 2. cria instância
// 3. registra webhook
// 4. inicia connect
// 5. polling aguardando QR
// 6. salva QR no banco
// ─────────────────────────────────────────────────────────────

async setup(branchId: string) {
  const instanceName = `anotaja_${branchId}`;
  const webhookUrl =
    process.env.EVOLUTION_WEBHOOK_URL ||
    'https://api2.vaidelli.com.br/api/whatsapp/webhook';

  // Salva estado inicial
  await prisma.whatsAppConfig.upsert({
    where: { branchId },
    update: {
      serverUrl: this.serverUrl,
      apiKey: this.globalApiKey,
      instanceName,
      status: 'connecting',
      qrCode: null,
    },
    create: {
      branchId,
      serverUrl: this.serverUrl,
      apiKey: this.globalApiKey,
      instanceName,
      status: 'connecting',
      qrCode: null,
    },
  });

  // Roda async — não bloqueia a resposta HTTP
  this.setupAsync(branchId, instanceName, webhookUrl).catch((err) =>
    this.logger.error('[WhatsApp] setupAsync error', err),
  );

  return {
    success: true,
    status: 'connecting',
    qrCode: null,
    instanceName,
  };
}

private async setupAsync(
  branchId: string,
  instanceName: string,
  webhookUrl: string,
) {
  try {
    // 1. Remove instância antiga
    await this.evolutionRequest('DELETE', `/instance/logout/${instanceName}`).catch(() => {});
    await this.sleep(1000);
    await this.evolutionRequest('DELETE', `/instance/delete/${instanceName}`).catch(() => {});
    await this.sleep(2000);

    // 2. Cria instância (qrcode: true já inicia a conexão internamente)
    this.logger.log('[WhatsApp] creating instance:', instanceName);
    await this.evolutionRequest('POST', '/instance/create', {
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
      rejectCall: false,
      groupsIgnore: false,
      alwaysOnline: false,
      readMessages: false,
      readStatus: false,
      syncFullHistory: false,
      storeMessages: true,
      storeFullMessages: true,
    });

    await this.sleep(2000);

    // 3. Registra webhook — formato correto para v2.2.x
    await this.evolutionRequest('POST', `/webhook/set/${instanceName}`, {
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: true,
        webhookBase64: true,  // QR vem como base64 no evento QRCODE_UPDATED
        events: ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT', 'MESSAGES_UPDATE'],
      },
    });

    this.logger.log('[WhatsApp] webhook registered');

    // 4. NÃO chama /instance/connect aqui
    // qrcode: true no create já cuida disso
    // O QR chegará via webhook QRCODE_UPDATED → salvo pelo endpoint /webhook

  } catch (error: any) {
    this.logger.error('[WhatsApp] setupAsync failed', error);
    await prisma.whatsAppConfig.update({
      where: { branchId },
      data: { status: 'disconnected', qrCode: null },
    });
  }
}

  async setupPartner(partnerId: string) {
    const instanceName = `vaidelli_partner_${partnerId}`;

    await prisma.whatsAppConfig.upsert({
      where: { partnerId },
      update: {
        serverUrl: this.serverUrl,
        apiKey: this.globalApiKey,
        instanceName,
        status: 'connecting',
      },
      create: {
        partnerId,
        serverUrl: this.serverUrl,
        apiKey: this.globalApiKey,
        instanceName,
        status: 'connecting',
      },
    });

    try {
      const createRes = await this.evolutionRequest(
        'POST',
        '/instance/create',
        {
          instanceName,
          integration: 'WHATSAPP-BAILEYS',
          qrcode: true,
          storeMessages: true,
          storeFullMessages: true,
        },
      );

      const webhookUrl = process.env.EVOLUTION_WEBHOOK_URL;
      if (webhookUrl) {
        await this.evolutionRequest(
          'POST',
          `/webhook/set/${instanceName}`,
          {
            url: webhookUrl,
            webhook_by_events: false,
            events: [
              'MESSAGES_UPSERT',
              'MESSAGES_UPDATE',
              'SEND_MESSAGE',
              'CONTACTS_UPDATE',
              'CHATS_UPDATE',
              'CHATS_UPSERT',
              'CHATS_DELETE',
              'CHATS_SET',
            ],
          },
        ).catch((e) => {});
      }

      const instanceId = createRes?.instance?.instanceId || createRes?.instance?.id;

      if (!instanceId) {
        console.error('[WhatsApp] No instance ID in create response');
        throw new BadRequestException('Failed to get instance ID from Evolution API');
      }

      await prisma.whatsAppConfig.update({
        where: { partnerId },
        data: {
          instanceId,
          status: 'qr_code',
        },
      });

      const connectRes = await this.evolutionRequest(
        'GET',
        `/instance/connect/${instanceName}`,
      );

      const qrCode = connectRes?.base64 || connectRes?.qrcode?.base64 || connectRes?.pairingCode || null;

      await prisma.whatsAppConfig.update({
        where: { partnerId },
        data: { qrCode },
      });

      return {
        status: 'qr_code',
        qrCode,
        instanceName,
      };
    } catch (error: any) {
      console.error('[WhatsApp] Partner setup error:', error);

      if (error?.status === 403 || error?.message?.includes('already') || error?.message?.includes('already in use')) {
        try {
          const connectRes = await this.evolutionRequest(
            'GET',
            `/instance/connect/${instanceName}`,
          );

          const qrCode = connectRes?.base64 || connectRes?.qrcode?.base64 || connectRes?.pairingCode || null;
          const status = qrCode ? 'qr_code' : 'connecting';

          await prisma.whatsAppConfig.update({
            where: { partnerId },
            data: { qrCode, status },
          });

          return { status, qrCode, instanceName };
        } catch (connectError: any) {
          console.error('[WhatsApp] Error fetching QR code for existing instance:', connectError);
          return this.connect(undefined, partnerId);
        }
      }

      await prisma.whatsAppConfig.update({
        where: { partnerId },
        data: { status: 'disconnected' },
      });

      throw new BadRequestException(
        `Falha ao conectar Evolution API: ${error?.message || 'Erro desconhecido'}`,
      );
    }
  }

async connect(branchId?: string, partnerId?: string) {
  const where = this.getConfigWhere(branchId, partnerId);
  const config = await prisma.whatsAppConfig.findFirst({ where });

  if (!config?.instanceName) {
    throw new BadRequestException('WhatsApp não configurado');
  }

  const instanceName = config.instanceName;

  const instance = await this.ensureInstance(instanceName);

  if (!instance.exists) {
    throw new BadRequestException(
      'Instância não existe. Rode setup novamente.',
    );
  }

  const res = await this.evolutionRequest(
    'GET',
    `/instance/connect/${instanceName}`,
  );

  const status = res?.base64 ? 'qr_code' : 'connecting';

  await prisma.whatsAppConfig.update({
    where: { id: config.id },
    data: {
      status,
      qrCode: res?.base64 || null,
    },
  });

  return {
    status,
    qrCode: res?.base64 || null,
  };
}

  async disconnect(branchId?: string, partnerId?: string) {
    const where = this.getConfigWhere(branchId, partnerId);
    const config = await prisma.whatsAppConfig.findFirst({ where });

    if (!config) {
      throw new BadRequestException('WhatsApp não configurado. Conecte o WhatsApp primeiro.');
    }

    try {
      await this.evolutionRequest('DELETE', `/instance/logout/${config.instanceName}`);
    } catch (error) {}

    try {
      await this.evolutionRequest('DELETE', `/instance/delete/${config.instanceName}`);
    } catch (error) {}

    await prisma.whatsAppChatRead.deleteMany({ where });

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
  const where = this.getConfigWhere(branchId, partnerId);
  const config = await prisma.whatsAppConfig.findFirst({ where });

  if (!config?.instanceName) {
    return { status: 'disconnected' };
  }

  try {
    const res = await this.evolutionRequest('GET', '/instance/fetchInstances');

    const instance = Array.isArray(res)
      ? res.find((x) => x.name === config.instanceName)
      : null;

    if (!instance) {
      return { status: config.status || 'disconnected', qrCode: config.qrCode };
    }

    const state =
      instance?.connectionStatus ||
      instance?.instance?.state ||
      instance?.state;

    let status = 'disconnected';
    if (state === 'open') {
      status = 'connected';
    } else if (state === 'connecting' || state === 'close') {
      status = config.qrCode ? 'qr_code' : 'connecting';
    }

    // QR: prioriza o que está no banco (salvo pelo webhook),
    // mas tenta buscar da API se ainda não tiver
    let qrCode = config.qrCode || instance?.qrcode?.base64 || null;

    // Se ainda não tem QR e está conectando, busca direto do /connect
    if (!qrCode && status === 'connecting') {
      const connectRes = await this.evolutionRequest(
        'GET',
        `/instance/connect/${config.instanceName}`,
      ).catch(() => null);

      qrCode =
        connectRes?.base64 ||
        connectRes?.qrcode?.base64 ||
        connectRes?.code ||
        null;

      if (qrCode) status = 'qr_code';
    }

    await prisma.whatsAppConfig.update({
      where: { id: config.id },
      data: { status, qrCode },
    });

    return {
      status,
      qrCode,
      phoneNumber: config.phoneNumber,
      profileName: config.profileName,
      profilePicUrl: config.profilePicUrl,
    };
  } catch (error) {
    this.logger.error('[WhatsApp] getStatus error', error);
    return {
      status: config.status || 'disconnected',
      qrCode: config.qrCode,
    };
  }
}

  // ─── Phone formatting ──────────────────────────────────────────

  /**
   * Formata número para o padrão E.164 brasileiro compatível com WhatsApp/Evolution API.
   *
   * Regras:
   * - Remove tudo que não for dígito
   * - Remove DDI 55 se já presente para normalizar
   * - Celulares BR: DDD(2) + 9 dígitos locais = 11 dígitos locais
   *   O WhatsApp registra a maioria dos celulares SEM o 9 extra (8 dígitos locais)
   *   então removemos o 9 do início do número (após o DDD) para evitar "exists: false"
   * - Fixos BR: DDD(2) + 8 dígitos = 10 dígitos locais — mantém como está
   * - Números internacionais (não começa com 55 e tem > 10 dígitos): retorna como está
   */
  /**
   * Normaliza número para E.164 brasileiro SEM alterar a quantidade de dígitos.
   *
   * Não removemos o 9 aqui porque é impossível distinguir:
   *   81 9 97895854  (nono dígito extra + número de 8 dígitos)
   *   81 997895854   (número de 9 dígitos legítimo)
   * ambos têm a mesma estrutura. Qualquer remoção automática quebra números válidos.
   *
   * O fallback em sendMessage tenta a variante com/sem 9 quando a primeira falha.
   */
  private formatPhone(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');

    // Já tem DDI 55 correto
    if (cleaned.startsWith('55') && cleaned.length >= 12) {
      return cleaned;
    }

    // Número sem DDI: adiciona 55
    return `55${cleaned}`;
  }

  /**
   * Gera a variante alternativa: se tem 13 dígitos (55+DDD+9+8), tenta sem o 9.
   * Se tem 12 dígitos (55+DDD+8), tenta com o 9.
   * Cobre tanto números antigos (8 dígitos) quanto novos (9 dígitos).
   */
  private formatPhoneAlternative(formatted: string): string | null {
    const local = formatted.startsWith('55') ? formatted.slice(2) : formatted;

    // 11 dígitos locais (DDD + 9 dígitos) → tenta sem o 9 após DDD
    if (local.length === 11 && local[2] === '9') {
      return `55${local.slice(0, 2)}${local.slice(3)}`;
    }

    // 10 dígitos locais (DDD + 8 dígitos) → tenta com o 9 após DDD
    if (local.length === 10) {
      return `55${local.slice(0, 2)}9${local.slice(2)}`;
    }

    return null;
  }

  /**
   * Verifica se o erro da Evolution API é especificamente "número não existe no WhatsApp".
   * Isso nos permite fazer fallback sem suprimir outros erros (ex: instância desconectada).
   */
  private isNumberNotFoundError(error: any): boolean {
    const candidates: string[] = [];
    if (typeof error?.message === 'string') candidates.push(error.message);
    if (typeof error?.response?.message === 'string') candidates.push(error.response.message);
    try { candidates.push(JSON.stringify(error?.response ?? '')); } catch {}
    try { candidates.push(JSON.stringify(error ?? '')); } catch {}
    const haystack = candidates.join(' ');
    return (
      haystack.includes('"exists":false') ||
      haystack.includes('"exists": false') ||
      haystack.includes('exists":false') ||
      haystack.toLowerCase().includes('number not found') ||
      haystack.toLowerCase().includes('phone number not found') ||
      (haystack.includes('jid') && haystack.includes('exists') && haystack.includes('false'))
    );
  }

  // ─── Send messages ────────────────────────────────────────────

  async sendTestMessage(branchId: string, dto: SendTestMessageDto) {
    const config = await this.getFullConfig(branchId);

    if (config.status !== 'connected') {
      throw new BadRequestException('WhatsApp nao esta conectado');
    }

    const phone = this.formatPhone(dto.phone);
    const message =
      dto.message ||
      'Mensagem de teste do Anotaja! Sua integracao WhatsApp esta funcionando.';

    await this.evolutionRequest(
      'POST',
      `/message/sendText/${config.instanceName}`,
      { number: phone, text: message },
    );

    return { success: true, message: 'Mensagem de teste enviada!' };
  }

  /**
   * Envia mensagem WhatsApp via Evolution API.
   *
   * Estratégia de fallback de número:
   * 1. Formata o número removendo o 9 extra (padrão mais comum no WhatsApp BR)
   * 2. Se a Evolution retornar "exists: false", tenta a variante alternativa (com o 9)
   * 3. Se ambas falharem, loga e lança exceção
   *
   * Isso resolve o problema de números cadastrados no banco com 9 dígitos (81199789585)
   * mas registrados no WhatsApp sem o 9 (8199789585), e vice-versa.
   */
  async sendMessage(
    phone: string,
    text: string,
    branchId?: string,
    partnerId?: string,
    customerId?: string,
    customerName?: string,
  ) {
    const where = this.getConfigWhere(branchId, partnerId);
    const config = await prisma.whatsAppConfig.findFirst({ where });

    if (!config || config.status !== 'connected') {
      throw new BadRequestException('WhatsApp não está conectado');
    }

    const primaryPhone = this.formatPhone(phone);
    const alternativePhone = this.formatPhoneAlternative(primaryPhone);

    this.logger.debug(
      `[WhatsApp] sendMessage — raw: ${phone} | primary: ${primaryPhone} | alt: ${alternativePhone ?? 'none'}`,
    );

    const attemptSend = async (numberToTry: string): Promise<void> => {
      await this.evolutionRequest(
        'POST',
        `/message/sendText/${config.instanceName}`,
        { number: numberToTry, text },
      );
    };

  let usedPhone = primaryPhone;
  let sendError: any = null;

  try {
    if (!config?.instanceName) {
      throw new BadRequestException('WhatsApp não está conectado');
    }

    // Descobre automaticamente qual formato existe no WhatsApp
    const validPhone = await this.resolveWhatsAppNumber(
      config.instanceName,
      phone,
    );

    if (!validPhone) {
      throw new BadRequestException(
        `Número ${phone} não possui WhatsApp`,
      );
    }

    usedPhone = validPhone;

      await attemptSend(primaryPhone);
      this.logger.log(`[WhatsApp] Mensagem enviada para ${primaryPhone}`);
    } catch (error: any) {
      sendError = error;

      // Tentativa 2: número alternativo (com/sem 9), apenas se o erro for "not found"
      
    }

    // Rastreia resultado no banco independente do sucesso/falha
    const messageStatus = sendError ? 'failed' : 'sent';
    try {
      await prisma.whatsAppMessage.create({
        data: {
          partnerId,
          branchId,
          customerId,
          customerPhone: usedPhone,
          customerName,
          message: text,
          status: messageStatus,
          sentAt: new Date(),
        },
      });
    } catch (dbError) {
      this.logger.error('[WhatsApp] Falha ao salvar registro de mensagem no banco:', dbError);
    }

    if (sendError) {
      console.error(`[WhatsApp] Failed to send message to ${phone}:`, sendError);
      throw new BadRequestException(`Falha ao enviar mensagem para ${phone}`);
    }

    return { success: true };
  }

  async sendBulkMessages(
    phonesWithPersonalization: Array<{ phone: string; name?: string; segment?: string; customerId?: string }>,
    message: string,
    branchId?: string,
    partnerId?: string,
  ) {
    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    let partnerCode: string | null = null;
    if (partnerId) {
      const partner = await prisma.partner.findUnique({
        where: { id: partnerId },
        select: { code: true },
      });
      partnerCode = partner?.code || null;
    }

    for (const { phone, name, segment, customerId } of phonesWithPersonalization) {
      try {
        let personalizedMessage = message;
        if (name) {
          personalizedMessage = personalizedMessage.replace(/{nome}/g, name);
        }
        if (segment) {
          personalizedMessage = personalizedMessage.replace(/{segmento}/g, segment);
        }
        personalizedMessage = personalizedMessage.replace(/{telefone}/g, phone);
        
        const frontendUrl = process.env.FRONTEND_URL || 'https://app.vaidelli.com';
        if (partnerCode) {
          personalizedMessage = personalizedMessage.replace(
            /{register-company}/g,
            `${frontendUrl}/register-company?partner=${partnerCode}`
          );
        } else {
          personalizedMessage = personalizedMessage.replace(
            /{register-company}/g,
            `${frontendUrl}/register-company`
          );
        }
        personalizedMessage = personalizedMessage.replace(
          /{admin-login}/g,
          `${frontendUrl}/admin/login`
        );
        personalizedMessage = personalizedMessage.replace(/{loja}/g, frontendUrl);

        await this.sendMessage(phone, personalizedMessage, branchId, partnerId, customerId, name);
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(`${phone}: ${error}`);
      }
    }

    return results;
  }

  async getMessageHistoryByPhone(phone: string, partnerId?: string, branchId?: string) {
    const formattedPhone = this.formatPhone(phone);
    
    const messages = await prisma.whatsAppMessage.findMany({
      where: {
        customerPhone: formattedPhone,
        partnerId,
        branchId,
      },
      orderBy: { sentAt: 'desc' },
      take: 50,
    });

    return messages;
  }

  async checkDuplicateMessage(phone: string, message: string, partnerId?: string, branchId?: string) {
    const formattedPhone = this.formatPhone(phone);
    
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);

    const duplicate = await prisma.whatsAppMessage.findFirst({
      where: {
        customerPhone: formattedPhone,
        message,
        partnerId,
        branchId,
        status: 'sent',
        sentAt: { gte: oneDayAgo },
      },
    });

    return !!duplicate;
  }

  // ─── CRM – Chats & Messages ────────────────────────────────────

  async fetchSingleChat(branchId: string, jid: string) {
    const config = await prisma.whatsAppConfig.findUnique({
      where: { branchId },
    });

    if (!config?.instanceName) {
      return null;
    }

    const customers = await prisma.customer.findMany({
      where: { branchId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        createdAt: true,
        orders: {
          select: {
            id: true,
            orderNumber: true,
            total: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        addresses: {
          where: { isDefault: true },
          select: {
            id: true,
            label: true,
            street: true,
            number: true,
            complement: true,
            neighborhood: true,
            city: true,
            state: true,
            zipCode: true,
            reference: true,
          },
          take: 1,
        },
      },
    });

    const newOrdersMap = new Map<string, number>();
    for (const customer of customers) {
      const newOrdersCount = customer.orders.filter(
        (o) => ['PENDING', 'CONFIRMED', 'READY'].includes(o.status)
      ).length;
      newOrdersMap.set(customer.id, newOrdersCount);
    }

    const spentByCustomer = await prisma.order.groupBy({
      by: ['customerId'],
      where: { branchId, customerId: { not: null } },
      _sum: { total: true },
    });

    const spentMap = new Map<string, number>(
      spentByCustomer.map((s) => [s.customerId!, s._sum.total ?? 0]),
    );

    const customerByPhone = new Map<string, typeof customers[number]>();
    for (const customer of customers) {
      const normalized = customer.phone.replace(/\D/g, '');
      customerByPhone.set(normalized, customer);
    }

    const findCustomer = (targetJid: string) => {
      const waPhone = targetJid.replace('@s.whatsapp.net', '');
      if (customerByPhone.has(waPhone)) return customerByPhone.get(waPhone)!;

      const stripCountry = (p: string) =>
        p.startsWith('55') && p.length >= 12 ? p.slice(2) : p;
      const waLocal = stripCountry(waPhone);

      for (const [phone, customer] of customerByPhone) {
        const dbLocal = stripCountry(phone);
        if (waLocal === dbLocal) return customer;
        if (waLocal.length === 9 && dbLocal.length === 8 && waLocal.startsWith('9') && waLocal.slice(1) === dbLocal) {
          return customer;
        }
      }
      return null;
    };

    const customer = findCustomer(jid);
    const lastOrder = customer?.orders[0] ?? null;
    const totalSpent = customer ? (spentMap.get(customer.id) ?? 0) : 0;
    const defaultAddress = customer?.addresses[0] ?? null;

    const raw = await this.evolutionRequest(
      'POST',
      `/chat/findChats/${config.instanceName}`,
      { where: { remoteJid: jid } },
    );

    const rawChats: any[] = Array.isArray(raw)
      ? raw
      : raw?.chats || raw?.data || raw?.records || [];

    const chat = rawChats.find((c: any) => {
      if (c.remoteJid === jid) return true;
      if (c.jid === jid) return true;
      if (c.id === jid) return true;
      return false;
    });

    if (!chat) {
      return {
        jid,
        name: customer?.name || this.jidToPhone(jid),
        phone: this.jidToPhone(jid),
        profilePicUrl: null,
        lastMessage: '',
        lastMessageType: 'text',
        lastMsgTimestamp: 0,
        formattedTimestamp: '',
        unreadCount: 0,
        customerId: customer?.id ?? null,
        totalOrders: customer ? (newOrdersMap.get(customer.id) ?? 0) : 0,
        totalSpent,
        lastOrderId: lastOrder?.orderNumber?.toString() ?? null,
        lastOrderTotal: lastOrder?.total ?? null,
        lastOrderStatus: lastOrder?.status ?? null,
        lastOrderDate: lastOrder?.createdAt ?? null,
        customer: customer ? {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          createdAt: customer.createdAt,
          orders: customer.orders,
          address: defaultAddress ? {
            id: defaultAddress.id,
            label: defaultAddress.label,
            street: defaultAddress.street,
            number: defaultAddress.number,
            complement: defaultAddress.complement,
            neighborhood: defaultAddress.neighborhood,
            city: defaultAddress.city,
            state: defaultAddress.state,
            zipCode: defaultAddress.zipCode,
            reference: defaultAddress.reference,
          } : null,
        } : null,
      };
    }

    return {
      jid,
      name: customer?.name || chat.name || chat.pushName || chat.verifiedName || this.jidToPhone(jid),
      phone: this.jidToPhone(jid),
      profilePicUrl: chat.profilePicUrl || null,
      lastMessage: this.extractTextFromMessage(chat.lastMessage) || '',
      lastMessageType: this.detectMediaType(chat.lastMessage),
      lastMsgTimestamp: chat.lastMsgTimestamp || chat.updatedAt || 0,
      formattedTimestamp: this.formatTimestamp(chat.lastMsgTimestamp || chat.updatedAt || 0),
      unreadCount: 0,
      customerId: customer?.id ?? null,
      totalOrders: customer ? (newOrdersMap.get(customer.id) ?? 0) : 0,
      totalSpent,
      lastOrderId: lastOrder?.orderNumber?.toString() ?? null,
      lastOrderTotal: lastOrder?.total ?? null,
      lastOrderStatus: lastOrder?.status ?? null,
      lastOrderDate: lastOrder?.createdAt ?? null,
      customer: customer ? {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        createdAt: customer.createdAt,
        orders: customer.orders,
        address: defaultAddress ? {
          id: defaultAddress.id,
          label: defaultAddress.label,
          street: defaultAddress.street,
          number: defaultAddress.number,
          complement: defaultAddress.complement,
          neighborhood: defaultAddress.neighborhood,
          city: defaultAddress.city,
          state: defaultAddress.state,
          zipCode: defaultAddress.zipCode,
          reference: defaultAddress.reference,
        } : null,
      } : null,
    };
  }

  async fetchChats(branchId: string) {
    const config = await this.getFullConfig(branchId);

    const raw = await this.evolutionRequest(
      'POST',
      `/chat/findChats/${config.instanceName}`,
      { where: {} },
    );

    const rawChats: any[] = Array.isArray(raw)
      ? raw
      : raw?.chats || raw?.data || raw?.records || [];

    const extractJid = (c: any): string => {
      if (typeof c.remoteJid === 'string' && c.remoteJid.includes('@')) return c.remoteJid;
      if (typeof c.jid === 'string' && c.jid.includes('@')) return c.jid;
      if (typeof c.id === 'string' && c.id.includes('@')) return c.id;
      if (c.key?.remoteJid && c.key.remoteJid.includes('@')) return c.key.remoteJid;
      if (typeof c.owner === 'string' && c.owner.includes('@')) return c.owner;
      return '';
    };

    const chatsByJid = new Map<string, any>();
    for (const c of rawChats) {
      const jid = extractJid(c);
      if (!jid || !jid.endsWith('@s.whatsapp.net')) continue;
      chatsByJid.set(jid, { ...c, _jid: jid });
    }

    for (const c of rawChats) {
      const jid = extractJid(c);
      if (!jid || !jid.endsWith('@lid')) continue;

      const altJid: string =
        c.lastMessage?.key?.remoteJidAlt ||
        c.lastMessage?.key?.participantAlt ||
        '';
      if (!altJid.endsWith('@s.whatsapp.net')) continue;

      const existing = chatsByJid.get(altJid);
      if (!existing) continue;

      const lidTs = c.lastMessage?.messageTimestamp || c.updatedAt || 0;
      const existingTs = existing.lastMessage?.messageTimestamp || existing.lastMsgTimestamp || existing.updatedAt || 0;

      if (Number(lidTs) > Number(existingTs)) {
        existing.lastMessage = c.lastMessage;
        existing.lastMsgTimestamp = lidTs;
        existing.updatedAt = c.updatedAt || existing.updatedAt;
      }
    }

    const individualChats = Array.from(chatsByJid.values());

    const chatReadStatuses = await prisma.whatsAppChatRead.findMany({
      where: { branchId },
    });

    const unreadCountMap = new Map<string, number>();
    for (const status of chatReadStatuses) {
      unreadCountMap.set(status.jid, status.unreadCount);
    }

    const [customers, spentByCustomer] = await Promise.all([
      prisma.customer.findMany({
        where: { branchId },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          createdAt: true,
          orders: {
            select: {
              id: true,
              orderNumber: true,
              total: true,
              status: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
          addresses: {
            where: { isDefault: true },
            select: {
              id: true,
              label: true,
              street: true,
              number: true,
              complement: true,
              neighborhood: true,
              city: true,
              state: true,
              zipCode: true,
              reference: true,
            },
            take: 1,
          },
        },
      }),
      prisma.order.groupBy({
        by: ['customerId'],
        where: { branchId, customerId: { not: null } },
        _sum: { total: true },
      }),
    ]);

    const spentMap = new Map<string, number>(
      spentByCustomer.map((s) => [s.customerId!, s._sum.total ?? 0]),
    );

    const newOrdersMap = new Map<string, number>();
    for (const customer of customers) {
      const newOrdersCount = customer.orders.filter(
        (o) => ['PENDING', 'CONFIRMED', 'READY'].includes(o.status)
      ).length;
      newOrdersMap.set(customer.id, newOrdersCount);
    }

    const customerByPhone = new Map<string, typeof customers[number]>();
    for (const customer of customers) {
      const normalized = customer.phone.replace(/\D/g, '');
      customerByPhone.set(normalized, customer);
    }

    const findCustomer = (jid: string) => {
      const waPhone = jid.replace('@s.whatsapp.net', '');
      if (customerByPhone.has(waPhone)) return customerByPhone.get(waPhone)!;

      const stripCountry = (p: string) =>
        p.startsWith('55') && p.length >= 12 ? p.slice(2) : p;
      const waLocal = stripCountry(waPhone);

      for (const [phone, customer] of customerByPhone) {
        const dbLocal = stripCountry(phone);
        if (waLocal === dbLocal) return customer;

        if (waLocal.length >= 10 && dbLocal.length >= 10) {
          const waArea = waLocal.slice(0, 2);
          const dbArea = dbLocal.slice(0, 2);
          if (waArea === dbArea) {
            const waNum = waLocal.slice(2);
            const dbNum = dbLocal.slice(2);
            if (waNum.length === 8 && dbNum.length === 9 && dbNum.startsWith('9') && dbNum.slice(1) === waNum) {
              return customer;
            }
            if (waNum.length === 9 && dbNum.length === 8 && waNum.startsWith('9') && waNum.slice(1) === dbNum) {
              return customer;
            }
          }
        }
      }
      return null;
    };

    const lastOrderIds = new Set<string>();
    for (const c of individualChats) {
      const customer = findCustomer(c._jid);
      const lastOrder = customer?.orders[0];
      if (lastOrder?.id) {
        lastOrderIds.add(lastOrder.id);
      }
    }

    const completeOrders = await prisma.order.findMany({
      where: { id: { in: Array.from(lastOrderIds) } },
    });

    const ordersMap = new Map(completeOrders.map(o => [o.id, o]));

    return individualChats.map((c: any) => {
      const customer = findCustomer(c._jid);
      const lastOrder = customer?.orders[0] ?? null;
      const totalSpent = customer ? (spentMap.get(customer.id) ?? 0) : 0;
      const defaultAddress = customer?.addresses[0] ?? null;

      const completeOrder = lastOrder?.id ? ordersMap.get(lastOrder.id) : null;
      const availableTransitions = completeOrder
        ? this.orderStateMachine.getAvailableTransitions(completeOrder)
        : [];

      return {
        jid: c._jid,
        name: customer?.name || c.name || c.pushName || c.verifiedName || this.jidToPhone(c._jid),
        phone: this.jidToPhone(c._jid),
        profilePicUrl: c.profilePicUrl || null,
        lastMessage: this.extractTextFromMessage(c.lastMessage) || '',
        lastMessageType: this.detectMediaType(c.lastMessage),
        lastMsgTimestamp: c.lastMsgTimestamp || c.updatedAt || 0,
        formattedTimestamp: this.formatTimestamp(c.lastMsgTimestamp || c.updatedAt || 0),
        unreadCount: unreadCountMap.get(c._jid) || 0,
        customerId: customer?.id ?? null,
        totalOrders: customer ? (newOrdersMap.get(customer.id) ?? 0) : 0,
        totalSpent,
        lastOrderId: lastOrder?.id ?? null,
        lastOrderNumber: lastOrder?.orderNumber?.toString() ?? null,
        lastOrderTotal: lastOrder?.total ?? null,
        lastOrderStatus: lastOrder?.status ?? null,
        lastOrderDate: lastOrder?.createdAt ?? null,
        lastOrderAvailableTransitions: availableTransitions,
        customer: customer ? {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          createdAt: customer.createdAt,
          orders: customer.orders,
          address: defaultAddress ? {
            id: defaultAddress.id,
            label: defaultAddress.label,
            street: defaultAddress.street,
            number: defaultAddress.number,
            complement: defaultAddress.complement,
            neighborhood: defaultAddress.neighborhood,
            city: defaultAddress.city,
            state: defaultAddress.state,
            zipCode: defaultAddress.zipCode,
            reference: defaultAddress.reference,
          } : null,
        } : null,
      };
    });
  }

  async fetchMessages(branchId: string, dto: FetchMessagesDto) {
    const config = await prisma.whatsAppConfig.findUnique({
      where: { branchId },
    });

    if (!config?.instanceName) {
      return [];
    }

    const count = dto.count || 50;

    const [outgoing, incoming] = await Promise.all([
      this.evolutionRequest(
        'POST',
        `/chat/findMessages/${config.instanceName}`,
        { where: { key: { remoteJid: dto.jid } }, limit: count },
      )
        .then((r) => this.extractMessagesFromResponse(r))
        .catch(() => [] as any[]),

      this.evolutionRequest(
        'POST',
        `/chat/findMessages/${config.instanceName}`,
        { where: { key: { remoteJidAlt: dto.jid } }, limit: count },
      )
        .then((r) => this.extractMessagesFromResponse(r))
        .catch(() => [] as any[]),
    ]);

    const raw = [...outgoing, ...incoming];

    if (raw.length === 0) {
      return [];
    }

    const seen = new Set<string>();
    const deduped = raw.filter((msg: any) => {
      const id = msg.key?.id || msg.id || String(msg.messageTimestamp);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    deduped.sort((a, b) => {
      const tA = typeof a.messageTimestamp === 'number' ? a.messageTimestamp : Number(a.messageTimestamp) || 0;
      const tB = typeof b.messageTimestamp === 'number' ? b.messageTimestamp : Number(b.messageTimestamp) || 0;
      return tB - tA;
    });

    let paginated = deduped;
    if (dto.cursor) {
      paginated = deduped.filter((msg: any) => {
        const ts = typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : Number(msg.messageTimestamp) || 0;
        return ts < dto.cursor!;
      });
    }

    return paginated.slice(0, count).map((msg: any) => ({
      id: msg.key?.id || msg.id || String(msg.messageTimestamp),
      fromMe: msg.key?.fromMe ?? false,
      text: this.extractTextFromMessage(msg) || '',
      timestamp: typeof msg.messageTimestamp === 'number'
        ? msg.messageTimestamp
        : Number(msg.messageTimestamp) || 0,
      status: this.mapEvolutionStatus(msg.status),
      mediaType: this.detectMediaType(msg),
      mediaUrl: this.extractMediaUrl(msg),
      pushName: msg.pushName || null,
    }));
  }

  async sendCrmMessage(branchId: string, dto: SendCrmMessageDto) {
    const config = await this.getFullConfig(branchId);

    const result = await this.evolutionRequest(
      'POST',
      `/message/sendText/${config.instanceName}`,
      { number: dto.jid, text: dto.text },
    );

    return {
      success: true,
      messageId: result?.key?.id || null,
    };
  }

  async sendCrmMedia(
    branchId: string,
    jid: string,
    file: Express.Multer.File,
    caption?: string,
  ) {
    const config = await this.getFullConfig(branchId);
    const isAudio = file.mimetype.startsWith('audio/');

    const base64File = file.buffer.toString('base64');

    const endpoint = isAudio
      ? `/message/sendWhatsAppAudio/${config.instanceName}`
      : `/message/sendMedia/${config.instanceName}`;

    const body = isAudio
      ? {
          number: jid,
          audio: base64File,
          encoding: true,
        }
      : {
          number: jid,
          mediatype: this.detectMediaTypeFromMime(file.mimetype),
          media: base64File,
          fileName: file.originalname,
          caption: caption || '',
        };

    const result = await this.evolutionRequest('POST', endpoint, body);

    return {
      success: true,
      messageId: result?.key?.id || result?.messageId || null,
    };
  }

  private detectMediaTypeFromMime(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.includes('pdf') || mimeType.includes('document')) return 'document';
    return 'document';
  }

  async downloadMedia(url: string): Promise<Buffer> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download media: ${response.statusText}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      return buffer;
    } catch (error) {
      console.error('[WhatsApp] downloadMedia - error:', error);
      throw error;
    }
  }

  async processWhatsAppAudio(url: string): Promise<string> {
    this.logger.log(`[WhatsApp] processWhatsAppAudio - Processing audio from URL: ${url}`);
    
    try {
      const buffer = await this.downloadMedia(url);
      
      const tempDir = '/tmp';
      const inputPath = path.join(tempDir, `${randomUUID()}.enc`);
      const outputPath = path.join(tempDir, `${randomUUID()}.mp3`);
      
      fs.writeFileSync(inputPath, buffer);
      
      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .output(outputPath)
          .audioCodec('libmp3lame')
          .audioBitrate('128k')
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run();
      });
      
      const convertedBuffer = fs.readFileSync(outputPath);
      
      fs.unlinkSync(inputPath);
      fs.unlinkSync(outputPath);
      
      const file: Express.Multer.File = {
        buffer: convertedBuffer,
        originalname: 'audio.mp3',
        mimetype: 'audio/mpeg',
        size: convertedBuffer.length,
        fieldname: 'audio',
        encoding: '7bit',
        stream: null as any,
        destination: '',
        filename: '',
        path: '',
      };
      
      const r2Url = await this.uploadService.uploadFile(file, 'whatsapp-audio');

      this.logger.log(`[WhatsApp] processWhatsAppAudio - Audio processed and uploaded to: ${r2Url}`);
      return r2Url;
    } catch (error) {
      this.logger.error(`[WhatsApp] processWhatsAppAudio - Error:`, error);
      throw error;
    }
  }

  async markChatAsRead(branchId?: string, partnerId?: string, jid?: string) {
    let actualBranchId = branchId;
    if (partnerId && !branchId) {
      console.warn('[markChatAsRead] Partner detected but WhatsAppChatRead only supports branchId. Skipping.');
      return { success: true };
    }

    if (!actualBranchId) {
      console.warn('[markChatAsRead] No branchId provided. Skipping.');
      return { success: true };
    }

    try {
      const branch = await prisma.branch.findUnique({
        where: { id: actualBranchId },
      });

      if (!branch) {
        console.warn(`[markChatAsRead] Branch ${actualBranchId} does not exist. Skipping.`);
        return { success: true };
      }
    } catch (error) {
      console.warn('[markChatAsRead] Failed to check branch existence:', error);
      return { success: true };
    }

    try {
      await prisma.whatsAppConfig.upsert({
        where: { branchId: actualBranchId },
        create: { branchId: actualBranchId },
        update: {},
      });
    } catch (error) {
      console.warn('Failed to ensure WhatsAppConfig:', error);
      return { success: true };
    }

    const config = await prisma.whatsAppConfig.findUnique({
      where: { branchId: actualBranchId },
    });

    if (!config) {
      console.warn(`[markChatAsRead] WhatsAppConfig for branch ${actualBranchId} does not exist. Skipping.`);
      return { success: true };
    }

    try {
      await prisma.whatsAppChatRead.upsert({
        where: {
          branchId_jid: {
            branchId: config.id,
            jid: jid || '',
          },
        },
        create: {
          branchId: config.id,
          jid: jid || '',
          unreadCount: 0,
          lastReadAt: new Date(),
        },
        update: {
          unreadCount: 0,
          lastReadAt: new Date(),
        },
      });
    } catch (error) {
      console.warn('Failed to upsert WhatsAppChatRead:', error);
    }

    return { success: true };
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private jidsMatch(a: string, b: string): boolean {
    if (!a || !b) return false;
    if (a === b) return true;

    const normalize = (jid: string) =>
      jid
        .replace(/@s\.whatsapp\.net|@lid|@g\.us/g, '')
        .replace(/\D/g, '');

    const nA = normalize(a);
    const nB = normalize(b);

    if (nA === nB) return true;

    const stripBR = (p: string) =>
      p.startsWith('55') && p.length >= 12 ? p.slice(2) : p;

    const lA = stripBR(nA);
    const lB = stripBR(nB);

    if (lA === lB) return true;

    if (lA.length >= 10 && lB.length >= 10) {
      const areaA = lA.slice(0, 2);
      const areaB = lB.slice(0, 2);

      if (areaA === areaB) {
        const numA = lA.slice(2);
        const numB = lB.slice(2);

        if (numA.length === 9 && numB.length === 8 && numA.startsWith('9') && numA.slice(1) === numB) return true;
        if (numB.length === 9 && numA.length === 8 && numB.startsWith('9') && numB.slice(1) === numA) return true;
      }
    }

    return false;
  }

  private extractMessagesFromResponse(result: any): any[] {
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.messages)) return result.messages;
    if (Array.isArray(result?.messages?.records)) return result.messages.records;
    if (Array.isArray(result?.records)) return result.records;
    if (Array.isArray(result?.data)) return result.data;
    return [];
  }

  private jidToPhone(jid: string): string {
    return '+' + (jid || '').replace('@s.whatsapp.net', '');
  }

  private extractTextFromMessage(msg: any): string {
    if (!msg) return '';
    if (typeof msg === 'string') return msg;
    const m = msg.message || msg;

    if (m.conversation) return m.conversation;
    if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
    if (m.buttonsResponseMessage?.selectedDisplayText) return m.buttonsResponseMessage.selectedDisplayText;
    if (m.listResponseMessage?.description) return m.listResponseMessage.description;
    if (m.reactionMessage?.text) return m.reactionMessage.text;

    if (m.imageMessage) return m.imageMessage.caption || '📷 Foto';
    if (m.videoMessage) return m.videoMessage.caption || '🎥 Vídeo';
    if (m.documentMessage) return m.documentMessage.caption || m.documentMessage.title || '📄 Documento';
    if (m.audioMessage) return m.audioMessage.caption || '🎤 Mensagem de voz';
    if (m.stickerMessage) return '😀 Sticker';
    if (m.locationMessage) return `📍 ${m.locationMessage.name || 'Localização'}`;
    if (m.contactMessage) return `👤 ${m.contactMessage.displayName || 'Contato'}`;

    return '';
  }

  private formatTimestamp(timestamp: number | string | Date): string {
    if (!timestamp) return '';
    
    const ts = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp);
    if (isNaN(ts.getTime())) return '';
    
    const now = new Date();
    const diffMs = now.getTime() - ts.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    
    if (diffHours < 24) {
      const hours = ts.getHours().toString().padStart(2, '0');
      const minutes = ts.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    }
    
    if (diffHours < 48) {
      return 'ontem';
    }
    
    const day = ts.getDate().toString().padStart(2, '0');
    const month = (ts.getMonth() + 1).toString().padStart(2, '0');
    const year = ts.getFullYear();
    return `${day}/${month}/${year}`;
  }

  private detectMediaType(msg: any): string {
    if (!msg?.message) return 'text';
    if (msg.message.imageMessage) return 'image';
    if (msg.message.videoMessage) return 'video';
    if (msg.message.audioMessage) return 'audio';
    if (msg.message.documentMessage) return 'document';
    if (msg.message.stickerMessage) return 'sticker';
    return 'text';
  }

  private extractMediaUrl(msg: any): string | null {
    if (!msg?.message) return null;
    if (msg.message.imageMessage?.url) return msg.message.imageMessage.url;
    if (msg.message.videoMessage?.url) return msg.message.videoMessage.url;
    if (msg.message.audioMessage?.url) return msg.message.audioMessage.url;
    if (msg.message.documentMessage?.url) return msg.message.documentMessage.url;
    if (msg.message.stickerMessage?.url) return msg.message.stickerMessage.url;
    return null;
  }

  private mapEvolutionStatus(status: string | number): string {
    if (typeof status === 'number') {
      const numericMap: Record<number, string> = {
        0: 'error',
        1: 'pending',
        2: 'sent',
        3: 'received',
        4: 'read',
        5: 'read',
      };
      return numericMap[status] ?? 'sent';
    }
 
    const statusMap: Record<string, string> = {
      'PENDING': 'pending',
      'SERVER_ACK': 'sent',
      'DELIVERY_ACK': 'received',
      'READ': 'read',
      'PLAYED': 'read',
      'ERROR': 'error',
    };
    return statusMap[String(status).toUpperCase()] || 'sent';
  }

  private async getFullConfig(branchId: string) {
    const config = await prisma.whatsAppConfig.findUnique({
      where: { branchId },
    });

    if (!config?.instanceName) {
      throw new BadRequestException(
        'WhatsApp nao configurado. Conecte o WhatsApp primeiro.',
      );
    }

    return config;
  }

  private getConfigWhere(branchId?: string, partnerId?: string) {
    if (partnerId) {
      return { partnerId };
    }
    if (branchId) {
      return { branchId };
    }
    return {};
  }

  async getFullConfigPublic(branchId: string) {
    const config = await prisma.whatsAppConfig.findUnique({
      where: { branchId },
    });
    return config;
  }

  // ─── Webhook registration ────────────────────────────────────

async registerWebhook(branchId: string, webhookUrl: string) {
  const config = await this.getFullConfig(branchId);

  const result = await this.evolutionRequest(
    'POST',
    `/webhook/set/${config.instanceName}`,
    {
      webhook: {           // ← wrapper obrigatório no v2.2.x
        enabled: true,
        url: webhookUrl,
        webhookByEvents: true,
        webhookBase64: false,
        events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'PRESENCE_UPDATE', 'CHATS_UPDATE'],
      },
    },
  );

  return result;
}

  // ─── Templates e Campanhas ─────────────────────────────────────

  async getTemplates(branchId?: string, partnerId?: string) {
    const where = this.getConfigWhere(branchId, partnerId);
    if (Object.keys(where).length === 0) {
      return [];
    }
    return prisma.messageTemplate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTemplate(dto: { name: string; content: string; category?: string }, branchId?: string, partnerId?: string) {
    const where = this.getConfigWhere(branchId, partnerId);
    return prisma.messageTemplate.create({
      data: {
        ...dto,
        branchId: where.branchId || undefined,
        partnerId: where.partnerId || undefined,
      },
    });
  }

  async updateTemplate(id: string, dto: { name?: string; content?: string; category?: string }) {
    return prisma.messageTemplate.update({
      where: { id },
      data: dto,
    });
  }

  async deleteTemplate(id: string) {
    return prisma.messageTemplate.delete({
      where: { id },
    });
  }

  async getCampaigns(branchId?: string, partnerId?: string) {
    const where = this.getConfigWhere(branchId, partnerId);
    if (Object.keys(where).length === 0) {
      return [];
    }
    return prisma.campaignRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createCampaign(dto: { name: string; message: string; recipients: number; sent: number; failed: number; status?: string; scheduledAt?: string }, branchId?: string, partnerId?: string) {
    const where = this.getConfigWhere(branchId, partnerId);
    return prisma.campaignRecord.create({
      data: {
        ...dto,
        branchId: where.branchId || undefined,
        partnerId: where.partnerId || undefined,
      },
    });
  }

  private async evolutionRequest(
    method: string,
    path: string,
    body?: any,
  ): Promise<any> {
    const url = `${this.serverUrl}${path}`;

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        apikey: this.globalApiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw new BadRequestException(
        `Evolution API error (${res.status}): ${errorBody}`,
      );
    }

    return res.json();
  }
}