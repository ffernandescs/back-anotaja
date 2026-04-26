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

@Injectable()
export class WhatsAppService {
  private logger = new Logger(WhatsAppService.name);

  constructor(private uploadService: UploadService) {}

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
          storeMessages: true,
          storeFullMessages: true,
        },
      );

      // Enable sync_full_history to import historical messages
      await this.evolutionRequest(
        'POST',
        `/settings/set/${instanceName}`,
        {
          sync_full_history: true,
          read_messages: true,
          read_status: true,
        },
      ).catch((e) => {
        console.log('[WhatsApp] Failed to set sync_full_history:', e);
      });

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

  async enableSyncHistory(branchId: string) {
    const config = await this.getFullConfig(branchId);
    
    try {
      await this.evolutionRequest(
        'POST',
        `/settings/set/${config.instanceName}`,
        {
          sync_full_history: true,
          read_messages: true,
          read_status: true,
        },
      );
      
      console.log('[WhatsApp] sync_full_history enabled for instance:', config.instanceName);
      
      return { success: true, message: 'sync_full_history enabled successfully' };
    } catch (error: any) {
      console.error('[WhatsApp] Failed to enable sync_full_history:', error);
      throw new BadRequestException('Failed to enable sync_full_history');
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
      await this.evolutionRequest(
        'DELETE',
        `/instance/logout/${config.instanceName}`,
      );
      console.log('[WhatsApp] Logout successful');
    } catch (error) {
      console.log('[WhatsApp] Logout failed:', error);
    }

    try {
      await this.evolutionRequest(
        'DELETE',
        `/instance/delete/${config.instanceName}`,
      );
      console.log('[WhatsApp] Instance deleted successfully');
    } catch (error) {
      console.log('[WhatsApp] Delete instance failed:', error);
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

    // Merge LID chats: incoming messages are stored under @lid JIDs.
    // If a @lid chat has lastMessage.key.remoteJidAlt pointing to an existing
    // @s.whatsapp.net chat with a newer timestamp, update that chat's lastMessage.
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

    // Fetch unread counts from database
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
        formattedTimestamp: this.formatTimestamp(c.lastMsgTimestamp || c.updatedAt || 0),
        unreadCount: unreadCountMap.get(c._jid) || 0,
        customerId: customer?.id ?? null,
        totalOrders: customer?._count.orders ?? 0,
        totalSpent,
        lastOrderId: lastOrder?.id ?? null,
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
    const config = await this.getFullConfig(branchId);
    const count = dto.count || 50;

    // WhatsApp uses two JID formats:
    //   - Outgoing msgs: key.remoteJid = "558182647354@s.whatsapp.net"
    //   - Incoming msgs: key.remoteJid = "39771615309944@lid", key.remoteJidAlt = "558182647354@s.whatsapp.net"
    // We query BOTH key.remoteJid AND key.remoteJidAlt to get the full conversation.
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

    // Deduplicate by message ID
    const seen = new Set<string>();
    const deduped = raw.filter((msg: any) => {
      const id = msg.key?.id || msg.id || String(msg.messageTimestamp);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    // Sort newest first
    deduped.sort((a, b) => {
      const tA = typeof a.messageTimestamp === 'number' ? a.messageTimestamp : Number(a.messageTimestamp) || 0;
      const tB = typeof b.messageTimestamp === 'number' ? b.messageTimestamp : Number(b.messageTimestamp) || 0;
      return tB - tA;
    });

    // Cursor-based pagination
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

  // Para áudio, usa sendWhatsAppAudio (PTT) em vez de sendMedia
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
    console.log('[WhatsApp] downloadMedia - url:', url);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download media: ${response.statusText}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      console.log('[WhatsApp] downloadMedia - buffer size:', buffer.length);
      return buffer;
    } catch (error) {
      console.error('[WhatsApp] downloadMedia - error:', error);
      throw error;
    }
  }

  async processWhatsAppAudio(url: string): Promise<string> {
    this.logger.log(`[WhatsApp] processWhatsAppAudio - Processing audio from URL: ${url}`);
    
    try {
      // Download audio from WhatsApp
      const buffer = await this.downloadMedia(url);
      
      // Create temp file path
      const tempDir = '/tmp';
      const inputPath = path.join(tempDir, `${randomUUID()}.enc`);
      const outputPath = path.join(tempDir, `${randomUUID()}.mp3`);
      
      // Write input file
      fs.writeFileSync(inputPath, buffer);
      
      // Convert using FFmpeg
      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .output(outputPath)
          .audioCodec('libmp3lame')
          .audioBitrate('128k')
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run();
      });
      
      // Read converted file
      const convertedBuffer = fs.readFileSync(outputPath);
      
      // Clean up temp files
      fs.unlinkSync(inputPath);
      fs.unlinkSync(outputPath);
      
      // Upload to R2
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

  async markChatAsRead(branchId: string, jid: string) {
    try {
      // Try to ensure WhatsAppConfig exists for this branch
      await prisma.whatsAppConfig.upsert({
        where: { branchId },
        create: { branchId },
        update: {},
      });
    } catch (error) {
      // If config creation fails, continue anyway
      console.warn('Failed to ensure WhatsAppConfig:', error);
    }

    try {
      await prisma.whatsAppChatRead.upsert({
        where: {
          branchId_jid: {
            branchId,
            jid,
          },
        },
        create: {
          branchId,
          jid,
          unreadCount: 0,
          lastReadAt: new Date(),
        },
        update: {
          unreadCount: 0,
          lastReadAt: new Date(),
        },
      });
    } catch (error) {
      // If still fails due to FK, try without the relation
      console.warn('Failed to upsert WhatsAppChatRead with FK, trying direct insert:', error);
      // Skip the operation if FK constraint fails
    }

    return { success: true };
  }

  // ─── Helpers ──────────────────────────────────────────────────

  /**
   * Compara dois JIDs do WhatsApp tolerando:
   * - sufixos @s.whatsapp.net / @lid
   * - código do país 55
   * - dígito 9 brasileiro (8 vs 9 dígitos após DDD)
   */
  private jidsMatch(a: string, b: string): boolean {
    if (!a || !b) return false;
    if (a === b) return true;

    const normalize = (jid: string) =>
      jid
        .replace(/@s\.whatsapp\.net|@lid|@g\.us/g, '')
        .replace(/\D/g, ''); // só números

    const nA = normalize(a);
    const nB = normalize(b);

    if (nA === nB) return true;

    // Remove código do país BR
    const stripBR = (p: string) =>
      p.startsWith('55') && p.length >= 12 ? p.slice(2) : p;

    const lA = stripBR(nA);
    const lB = stripBR(nB);

    if (lA === lB) return true;

    // Dígito 9 brasileiro: DDD (2) + número (8 ou 9 dígitos)
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

  /**
   * Extract text from a message object
   */
  private extractTextFromMessage(msg: any): string {
    if (!msg) return '';
    if (typeof msg === 'string') return msg;
    if (msg.message?.conversation) return msg.message.conversation;
    if (msg.message?.extendedTextMessage?.text) return msg.message.extendedTextMessage.text;
    if (msg.message?.imageMessage?.caption) return msg.message.imageMessage.caption;
    if (msg.message?.videoMessage?.caption) return msg.message.videoMessage.caption;
    if (msg.message?.documentMessage?.caption) return msg.message.documentMessage.caption;
    if (msg.message?.audioMessage?.caption) return msg.message.audioMessage.caption;
    if (msg.message?.buttonsResponseMessage?.selectedDisplayText) return msg.message.buttonsResponseMessage.selectedDisplayText;
    if (msg.message?.listResponseMessage?.description) return msg.message.listResponseMessage.description;
    if (msg.message?.reactionMessage?.text) return msg.message.reactionMessage.text;
    return '';
  }

  /**
   * Format timestamp for display:
   * - Today: show time (e.g., 14:30)
   * - Yesterday (24-48h): show "ontem"
   * - 2+ days ago: show date (e.g., 24/03/2026)
   */
  private formatTimestamp(timestamp: number | string | Date): string {
    if (!timestamp) return '';
    
    const ts = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp);
    if (isNaN(ts.getTime())) return '';
    
    const now = new Date();
    const diffMs = now.getTime() - ts.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    
    // Today: show time
    if (diffHours < 24) {
      const hours = ts.getHours().toString().padStart(2, '0');
      const minutes = ts.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    }
    
    // Yesterday (24-48h): show "ontem"
    if (diffHours < 48) {
      return 'ontem';
    }
    
    // 2+ days ago: show date
    const day = ts.getDate().toString().padStart(2, '0');
    const month = (ts.getMonth() + 1).toString().padStart(2, '0');
    const year = ts.getFullYear();
    return `${day}/${month}/${year}`;
  }

  /**
   * Detect media type from message
   */
  private detectMediaType(msg: any): string {
    if (!msg.message) return 'text';
    if (msg.message.imageMessage) return 'image';
    if (msg.message.videoMessage) return 'video';
    if (msg.message.audioMessage) return 'audio';
    if (msg.message.documentMessage) return 'document';
    if (msg.message.stickerMessage) return 'sticker';
    return 'text';
  }

  /**
   * Map Evolution API status to CRM status
   */
  private mapEvolutionStatus(status: string | number): string {
  // Status numérico (Evolution API padrão conforme documentação WhatsApp Business)
  if (typeof status === 'number') {
    const numericMap: Record<number, string> = {
      0: 'error',    // ERROR
      1: 'pending',  // PENDING
      2: 'sent',     // SERVER_ACK — chegou ao servidor WhatsApp
      3: 'received', // DELIVERY_ACK — entregue no aparelho
      4: 'read',     // READ — destinatário visualizou
      5: 'read',     // PLAYED — áudio ouvido (equivalente a read)
    };
    return numericMap[status] ?? 'sent';
  }
 
  // Status string
  const statusMap: Record<string, string> = {
    'PENDING': 'pending',
    'SERVER_ACK': 'sent',
    'DELIVERY_ACK': 'received', // CORRIGIDO: era 'delivered', agora 'received'
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

  private formatPhone(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');
    if (!cleaned.startsWith('55')) {
      cleaned = '55' + cleaned;
    }
    return cleaned;
  }

  async getFullConfigPublic(branchId: string) {
    return this.getFullConfig(branchId);
  }

  // ─── Webhook registration ────────────────────────────────────

  async registerWebhook(branchId: string, webhookUrl: string) {
    const config = await this.getFullConfig(branchId);

    console.log('[WhatsApp] Registering webhook for', config.instanceName, '→', webhookUrl);

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