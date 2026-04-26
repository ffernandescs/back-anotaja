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

    const raw = await this.evolutionRequest(
      'POST',
      `/chat/findChats/${config.instanceName}`,
      { where: {} },
    );

    const rawChats: any[] = Array.isArray(raw)
      ? raw
      : raw?.chats || raw?.data || raw?.records || [];

    // Extract JID from various Evolution API response formats
    const extractJid = (c: any): string => {
      // Direct JID fields
      if (typeof c.remoteJid === 'string' && c.remoteJid.includes('@')) return c.remoteJid;
      if (typeof c.jid === 'string' && c.jid.includes('@')) return c.jid;
      if (typeof c.id === 'string' && c.id.includes('@')) return c.id;
      // Nested key object
      if (c.key?.remoteJid && c.key.remoteJid.includes('@')) return c.key.remoteJid;
      // Owner field (some versions)
      if (typeof c.owner === 'string' && c.owner.includes('@')) return c.owner;
      return '';
    };

    const chatsByJid = new Map<string, any>();
    for (const c of rawChats) {
      const jid = extractJid(c);
      if (!jid || !jid.endsWith('@s.whatsapp.net')) continue;
      chatsByJid.set(jid, { ...c, _jid: jid });
    }

    const individualChats = Array.from(chatsByJid.values());

    // ── Enrich with customer data from DB ─────────────────────────
    const [customers, spentByCustomer] = await Promise.all([
      prisma.customer.findMany({
        where: { branchId },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          createdAt: true,
          _count: { select: { orders: true } },
          orders: {
            select: {
              id: true,
              total: true,
              status: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 5, // Return last 5 orders for CRM
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

    // Build fast lookup maps
    const spentMap = new Map<string, number>(
      spentByCustomer.map((s) => [s.customerId!, s._sum.total ?? 0]),
    );

    const customerByPhone = new Map<string, typeof customers[number]>();
    for (const customer of customers) {
      const normalized = customer.phone.replace(/\D/g, '');
      customerByPhone.set(normalized, customer);
    }

    const findCustomer = (jid: string) => {
      console.log('findCustomer', jid);
      const waPhone = jid.replace('@s.whatsapp.net', '');
      if (customerByPhone.has(waPhone)) return customerByPhone.get(waPhone)!;

      // Strip country code (55) for local comparison
      const stripCountry = (p: string) =>
        p.startsWith('55') && p.length >= 12 ? p.slice(2) : p;
      const waLocal = stripCountry(waPhone);

      for (const [phone, customer] of customerByPhone) {
        const dbLocal = stripCountry(phone);
        if (waLocal === dbLocal) return customer;

        // Handle Brazilian 9th digit: WhatsApp JID may omit the leading 9
        // e.g. JID = 558182647354 (area 81 + 8 digits) vs DB = 5581982647354 (area 81 + 9 digits)
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

    return individualChats.map((c: any) => {
      const customer = findCustomer(c._jid);
      const lastOrder = customer?.orders[0] ?? null;
      const totalSpent = customer ? (spentMap.get(customer.id) ?? 0) : 0;
      const defaultAddress = customer?.addresses[0] ?? null;

      return {
        jid: c._jid,
        name: customer?.name || c.name || c.pushName || c.verifiedName || this.jidToPhone(c._jid),
        phone: this.jidToPhone(c._jid),
        profilePicUrl: c.profilePicUrl || null,
        lastMessage: this.extractTextFromMessage(c.lastMessage) || '',
        lastMsgTimestamp: c.lastMsgTimestamp || c.updatedAt || 0,
        unreadCount: c.unreadCount || 0,
        customerId: customer?.id ?? null,
        totalOrders: customer?._count.orders ?? 0,
        totalSpent,
        lastOrderId: lastOrder?.id ?? null,
        lastOrderTotal: lastOrder?.total ?? null,
        lastOrderStatus: lastOrder?.status ?? null,
        lastOrderDate: lastOrder?.createdAt ?? null,
        // Include full customer object when found
        customer: customer ? {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          createdAt: customer.createdAt,
          orders: customer.orders,
          _count: customer._count,
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
    console.log('[CRM] fetchMessages called with jid:', dto.jid, 'count:', dto.count, 'cursor:', dto.cursor);
    const config = await this.getFullConfig(branchId);

    const count = dto.count || 50;

    // Fetch from multiple sources in parallel and merge to get both incoming and outgoing messages
    const results = await Promise.allSettled([
      this.evolutionRequest(
        'POST',
        `/chat/findMessages/${config.instanceName}`,
        {
          where: { key: { remoteJid: dto.jid } },
          limit: count,
        },
      ),
      this.evolutionRequest(
        'POST',
        `/message/find/${config.instanceName}`,
        {
          where: { key: { remoteJid: dto.jid } },
          limit: count,
        },
      ),
    ]);

    const raw: any[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const extracted = this.extractMessagesFromResponse(result.value);
        console.log('[CRM] Extracted', extracted.length, 'messages from endpoint');
        raw.push(...extracted);
      } else {
        console.log('[CRM] Endpoint request failed:', result.reason);
      }
    }

    console.log('[CRM] Total raw messages before filter:', raw.length);

    if (raw.length === 0) {
      console.log('[CRM] No messages found, returning empty array');
      return [];
    }

    // Filter messages to only include those matching the requested JID
    const filtered = raw.filter((msg: any) => {
      const msgRemoteJid = msg.key?.remoteJid || msg.remoteJid;
      if (msgRemoteJid === dto.jid) return true;
      const requestedPhone = dto.jid.replace('@s.whatsapp.net', '').replace('@lid', '');
      const msgPhone = msgRemoteJid.replace('@s.whatsapp.net', '').replace('@lid', '').replace('@g.us', '');
      if (requestedPhone === msgPhone) return true;
      return false;
    });

    console.log('[CRM] Messages after JID filter:', filtered.length);

    // Deduplicate by message ID
    const seen = new Set<string>();
    const deduped = filtered.filter((msg: any) => {
      const id = msg.key?.id || msg.id || String(msg.messageTimestamp);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    console.log('[CRM] Messages after deduplication:', deduped.length);

    // Sort by timestamp (newest first)
    deduped.sort((a, b) => {
      const timestampA = typeof a.messageTimestamp === 'number' ? a.messageTimestamp : Number(a.messageTimestamp) || 0;
      const timestampB = typeof b.messageTimestamp === 'number' ? b.messageTimestamp : Number(b.messageTimestamp) || 0;
      return timestampB - timestampA; // Newest first
    });

    // Apply cursor-based pagination (fetch messages before cursor timestamp)
    let paginated = deduped;
    if (dto.cursor) {
      paginated = deduped.filter((msg: any) => {
        const timestamp = typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : Number(msg.messageTimestamp) || 0;
        return timestamp < dto.cursor!;
      });
      console.log('[CRM] Messages after cursor filter:', paginated.length);
    }

    // Limit to requested count
    const limited = paginated.slice(0, count);
    console.log('[CRM] Final messages to return:', limited.length);

    return limited.map((msg: any) => ({
      id: msg.key?.id || msg.id || String(msg.messageTimestamp),
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

  private extractMessagesFromResponse(result: any): any[] {
    if (Array.isArray(result)) {
      return result;
    } else if (Array.isArray(result?.messages)) {
      return result.messages;
    } else if (Array.isArray(result?.messages?.records)) {
      return result.messages.records;
    } else if (Array.isArray(result?.records)) {
      return result.records;
    } else if (Array.isArray(result?.data)) {
      return result.data;
    }
    return [];
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

  // ─── Webhook registration ────────────────────────────────────

  async registerWebhook(branchId: string, webhookUrl: string) {
    const config = await this.getFullConfig(branchId);

    console.log('[WhatsApp] Registering webhook for', config.instanceName, '→', webhookUrl);

    // First, disable existing webhook
    try {
      await this.evolutionRequest('POST', `/webhook/set/${config.instanceName}`, {
        webhook: {
          enabled: false,
          url: webhookUrl,
          webhookByEvents: false,
          webhookBase64: false,
        },
      });
      console.log('[WhatsApp] Old webhook disabled');
    } catch {
      console.log('[WhatsApp] Could not disable old webhook (may not exist)');
    }

    // Then create new webhook
    const result = await this.evolutionRequest(
      'POST',
      `/webhook/set/${config.instanceName}`,
      {
        webhook: {
          enabled: true,
          url: webhookUrl,
          webhookByEvents: true,
          webhookBase64: false,
          events: [
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
            'PRESENCE_UPDATE',
            'CHATS_UPDATE',
          ],
        },
      },
    );

    console.log('[WhatsApp] Webhook registered:', JSON.stringify(result));
    return result;
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
