import { Injectable, BadRequestException } from '@nestjs/common';
import { prisma } from '../../../lib/prisma';
import {
  UpdateWhatsAppConfigDto,
  SendTestMessageDto,
  FetchMessagesDto,
  SendCrmMessageDto,
} from './dto/whatsapp.dto';

@Injectable()
export class WhatsAppService {
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

  // ─── Evolution API – Instance management ──────────────────────

  async setup(branchId: string) {
    const instanceName = `anotaja_${branchId}`;

    console.log('[WhatsApp] Setting up instance:', instanceName);
    console.log('[WhatsApp] Evolution API URL:', this.serverUrl);

    await prisma.whatsAppConfig.upsert({
      where: { branchId },
      update: {
        serverUrl: this.serverUrl,
        apiKey: this.globalApiKey,
        instanceName,
        status: 'connecting',
      },
      create: {
        branchId,
        serverUrl: this.serverUrl,
        apiKey: this.globalApiKey,
        instanceName,
        status: 'connecting',
      },
    });

    try {
      console.log('[WhatsApp] Creating instance with:', {
        instanceName,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
      });

      const createRes = await this.evolutionRequest(
        'POST',
        '/instance/create',
        {
          instanceName,
          integration: 'WHATSAPP-BAILEYS',
          qrcode: true,
        },
      );

      console.log('[WhatsApp] Create response:', JSON.stringify(createRes, null, 2));

      const instanceId = createRes?.instance?.instanceId || createRes?.instance?.id;

      if (!instanceId) {
        console.error('[WhatsApp] No instance ID in create response');
        throw new BadRequestException('Failed to get instance ID from Evolution API');
      }

      await prisma.whatsAppConfig.update({
        where: { branchId },
        data: {
          instanceId,
          status: 'qr_code',
        },
      });

      // Fetch QR code from connect endpoint
      console.log('[WhatsApp] Fetching QR code from connect endpoint');
      const connectRes = await this.evolutionRequest(
        'GET',
        `/instance/connect/${instanceName}`,
      );

      console.log('[WhatsApp] Connect response:', JSON.stringify(connectRes, null, 2));

      const qrCode = connectRes?.base64 || connectRes?.qrcode?.base64 || connectRes?.pairingCode || null;

      if (!qrCode) {
        console.error('[WhatsApp] No QR code in connect response');
      }

      await prisma.whatsAppConfig.update({
        where: { branchId },
        data: {
          qrCode,
        },
      });

      return {
        status: 'qr_code',
        qrCode,
        instanceName,
      };
    } catch (error: any) {
      console.error('[WhatsApp] Setup error:', error);

      if (error?.status === 403 || error?.message?.includes('already')) {
        console.log('[WhatsApp] Instance already exists, calling connect');
        return this.connect(branchId);
      }

      await prisma.whatsAppConfig.update({
        where: { branchId },
        data: { status: 'disconnected' },
      });

      throw new BadRequestException(
        `Falha ao conectar Evolution API: ${error?.message || 'Erro desconhecido'}`,
      );
    }
  }

  async connect(branchId: string) {
    const config = await this.getFullConfig(branchId);

    const res = await this.evolutionRequest(
      'GET',
      `/instance/connect/${config.instanceName}`,
    );

    const status = res?.base64 ? 'qr_code' : 'connecting';

    await prisma.whatsAppConfig.update({
      where: { branchId },
      data: {
        status,
        qrCode: res?.base64 || null,
      },
    });

    return { status, qrCode: res?.base64 || null };
  }

  async disconnect(branchId: string) {
    const config = await this.getFullConfig(branchId);

    console.log('[WhatsApp] Disconnecting instance:', config.instanceName);

    try {
      // First try to logout
      await this.evolutionRequest(
        'DELETE',
        `/instance/logout/${config.instanceName}`,
      );
      console.log('[WhatsApp] Logout successful');
    } catch (error) {
      console.log('[WhatsApp] Logout failed:', error);
      // ignore – instance may already be disconnected
    }

    try {
      // Then delete the instance completely
      await this.evolutionRequest(
        'DELETE',
        `/instance/delete/${config.instanceName}`,
      );
      console.log('[WhatsApp] Instance deleted successfully');
    } catch (error) {
      console.log('[WhatsApp] Delete instance failed:', error);
      // ignore – instance may already be deleted
    }

    await prisma.whatsAppConfig.update({
      where: { branchId },
      data: {
        status: 'disconnected',
        qrCode: null,
        phoneNumber: null,
        profileName: null,
        profilePicUrl: null,
        instanceName: null,
        instanceId: null,
      },
    });

    return { status: 'disconnected' };
  }

  async getStatus(branchId: string) {
    const config = await prisma.whatsAppConfig.findUnique({
      where: { branchId },
    });

    if (!config?.instanceName) {
      return { status: 'disconnected' };
    }

    try {
      const res = await this.evolutionRequest(
        'GET',
        `/instance/connectionState/${config.instanceName}`,
      );

      const state = res?.instance?.state || res?.state || 'close';
      let status: string;

      if (state === 'open') {
        status = 'connected';

        if (config.status !== 'connected') {
          try {
            const info = await this.evolutionRequest(
              'GET',
              `/instance/fetchInstances?instanceName=${config.instanceName}`,
            );
            const inst = Array.isArray(info) ? info[0] : info;

            await prisma.whatsAppConfig.update({
              where: { branchId },
              data: {
                status: 'connected',
                phoneNumber: inst?.instance?.owner?.split('@')[0] || config.phoneNumber,
                profileName: inst?.instance?.profileName || config.profileName,
                profilePicUrl: inst?.instance?.profilePicUrl || config.profilePicUrl,
                qrCode: null,
              },
            });
          } catch {
            await prisma.whatsAppConfig.update({
              where: { branchId },
              data: { status: 'connected', qrCode: null },
            });
          }
        }
      } else if (state === 'connecting') {
        // Check if QR code is available in database
        if (config.qrCode) {
          status = 'qr_code';
        } else {
          status = 'connecting';
        }
      } else {
        status = 'disconnected';
      }

      return {
        status,
        phoneNumber: config.phoneNumber,
        profileName: config.profileName,
        profilePicUrl: config.profilePicUrl,
      };
    } catch {
      return { status: config.status || 'disconnected' };
    }
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

  async sendMessage(branchId: string, phone: string, text: string) {
    const config = await prisma.whatsAppConfig.findUnique({
      where: { branchId },
    });

    if (!config || config.status !== 'connected' || !config.enabled) {
      return;
    }

    const formattedPhone = this.formatPhone(phone);

    try {
      await this.evolutionRequest(
        'POST',
        `/message/sendText/${config.instanceName}`,
        { number: formattedPhone, text },
      );
    } catch (error) {
      console.error(`[WhatsApp] Falha ao enviar mensagem para ${phone}:`, error);
    }
  }

  // ─── CRM – Chats & Messages ────────────────────────────────────

  async fetchChats(branchId: string) {
    const config = await this.getFullConfig(branchId);

    if (config.status !== 'connected') {
      throw new BadRequestException('WhatsApp nao esta conectado');
    }

    const chats: any[] = await this.evolutionRequest(
      'POST',
      `/chat/findChats/${config.instanceName}`,
      {},
    );

    // Normalize and return (filter only individual chats, ignore groups)
    return (chats || [])
      .filter((c: any) => c.id?.endsWith('@s.whatsapp.net'))
      .map((c: any) => ({
        jid: c.id,
        name: c.name || c.pushName || this.jidToPhone(c.id),
        phone: this.jidToPhone(c.id),
        profilePicUrl: c.profilePicUrl || null,
        lastMessage: this.extractTextFromMessage(c.lastMessage) || '',
        lastMsgTimestamp: c.lastMsgTimestamp || 0,
        unreadCount: c.unreadCount || 0,
      }));
  }

  async fetchMessages(branchId: string, dto: FetchMessagesDto) {
    const config = await this.getFullConfig(branchId);

    if (config.status !== 'connected') {
      throw new BadRequestException('WhatsApp nao esta conectado');
    }

    const count = dto.count || 50;

    const result: any = await this.evolutionRequest(
      'POST',
      `/chat/findMessages/${config.instanceName}`,
      {
        where: { key: { remoteJid: dto.jid } },
        limit: count,
      },
    );

    const raw: any[] = Array.isArray(result) ? result : result?.messages || [];

    return raw.map((msg: any) => ({
      id: msg.key?.id || String(msg.messageTimestamp),
      fromMe: msg.key?.fromMe ?? false,
      text: this.extractTextFromMessage(msg) || '',
      timestamp: typeof msg.messageTimestamp === 'number'
        ? msg.messageTimestamp
        : Number(msg.messageTimestamp) || 0,
      status: this.mapEvolutionStatus(msg.status),
      mediaType: this.detectMediaType(msg),
      pushName: msg.pushName || null,
    }));
  }

  async sendCrmMessage(branchId: string, dto: SendCrmMessageDto) {
    const config = await this.getFullConfig(branchId);

    if (config.status !== 'connected') {
      throw new BadRequestException('WhatsApp nao esta conectado');
    }

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

  // ─── Helpers ──────────────────────────────────────────────────

  private jidToPhone(jid: string): string {
    return '+' + (jid || '').replace('@s.whatsapp.net', '').replace('@g.us', '');
  }

  private extractTextFromMessage(msg: any): string | null {
    if (!msg) return null;

    const m = msg.message || msg;
    return (
      m.conversation ||
      m.extendedTextMessage?.text ||
      m.imageMessage?.caption ||
      m.videoMessage?.caption ||
      m.documentMessage?.title ||
      m.contactMessage?.displayName ||
      m.locationMessage?.name ||
      null
    );
  }

  private mapEvolutionStatus(status?: number): string {
    switch (status) {
      case 0: return 'error';
      case 1: return 'pending';
      case 2: return 'sent';
      case 3: return 'received';
      case 4: return 'read';
      case 5: return 'read';
      default: return 'sent';
    }
  }

  private detectMediaType(msg: any): string {
    const m = msg.message || {};
    if (m.imageMessage) return 'image';
    if (m.documentMessage) return 'document';
    if (m.audioMessage) return 'audio';
    if (m.videoMessage) return 'video';
    if (m.locationMessage) return 'location';
    if (m.contactMessage) return 'contact';
    if (m.stickerMessage) return 'sticker';
    return 'text';
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

  private formatPhone(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');
    if (!cleaned.startsWith('55')) {
      cleaned = '55' + cleaned;
    }
    return cleaned;
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
