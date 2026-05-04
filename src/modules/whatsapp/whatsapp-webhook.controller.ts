import { Controller, Post, Body, Logger } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { OrdersWebSocketGateway } from '../websocket/websocket.gateway';
import { WhatsAppService } from './whatsapp.service';
import { prisma } from '../../../lib/prisma';

/**
 * Webhook receiver for Evolution API events.
 * No auth guard — Evolution API calls this endpoint directly.
 *
 * Events handled:
 *  - messages.upsert   → new message (incoming or outgoing)
 *  - messages.update    → status change (delivered, read)
 *  - presence.update    → typing, online/offline
 *  - chats.update       → unread count, last message
 *  - contacts.update    → contact profile changes
 */
@Controller('whatsapp/webhook')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(
    private readonly wsGateway: OrdersWebSocketGateway,
    private readonly whatsappService: WhatsAppService,
  ) {}

  @Public()
  @Post('messages-upsert')
  async handleMessagesUpsert(@Body() body: any) {
    const instanceName: string = body.instance || '';
    this.logger.log(`[WhatsAppWebhook] messages-upsert received for instance: ${instanceName}`);
    
    const branchId = await this.resolveBranchId(instanceName);
    if (!branchId) {
      this.logger.warn(`[WhatsAppWebhook] Could not resolve branchId for instance: ${instanceName}`);
      return { received: true };
    }

    this.logger.log(`[WhatsAppWebhook] Resolved branchId: ${branchId} for instance: ${instanceName}`);
    const branchRoom = `branch:${branchId}`;
    const data = body.data;
    if (!data) return { received: true };

    const msg = data.message || data;
    const key = msg.key || data.key || {};

    // Resolve the real JID: incoming messages via LID have the phone in remoteJidAlt
    const remoteJid = this.resolvePhoneJid(key, data);
    if (!remoteJid) return { received: true };

    const phone = remoteJid.replace('@s.whatsapp.net', '');

    const payload = {
      id: key.id || String(Date.now()),
      remoteJid,
      fromMe: key.fromMe ?? false,
      text: this.extractText(msg),
      timestamp: msg.messageTimestamp || Math.floor(Date.now() / 1000),
      pushName: msg.pushName || data.pushName || '',
      phone,
      status: key.fromMe ? 'sent' : 'received',
      mediaType: this.detectMediaType(msg),
      mediaUrl: this.extractMediaUrl(msg),
    };

    console.log('[WhatsAppWebhook] Emitting crm:message event:', JSON.stringify(payload, null, 2));
    this.wsGateway.emitCRMEvent(branchRoom, 'crm:message', payload);

    // Increment unread count in database for incoming messages
    if (!key.fromMe) {
      await this.incrementUnreadCount(branchId, remoteJid, payload.timestamp);
    }

    // Fetch complete chat data for update
    try {
      const chatData = await this.whatsappService.fetchSingleChat(branchId, remoteJid);
      if (chatData) {
        this.wsGateway.emitCRMEvent(branchRoom, 'crm:chat:update', chatData);
      }
    } catch (error) {
      this.logger.error(`[WhatsAppWebhook] Failed to fetch chat data for ${remoteJid}:`, error);
      // Fallback to basic update if fetch fails
      this.wsGateway.emitCRMEvent(branchRoom, 'crm:chat:update', {
        remoteJid,
        lastMessage: payload.text,
        lastMsgTimestamp: payload.timestamp,
        pushName: payload.pushName,
        phone,
      });
    }

    return { received: true };
  }

  @Public()
  @Post('contacts-update')
  async handleContactsUpdate(@Body() body: any) {
    const instanceName: string = body.instance || '';
    const branchId = await this.resolveBranchId(instanceName);
    if (!branchId) return { received: true };

    const branchRoom = `branch:${branchId}`;
    const contacts = Array.isArray(body.data) ? body.data : [body.data];

    for (const contact of contacts) {
      if (!contact) continue;
      const remoteJid = contact.remoteJid || contact.id || '';
      if (!remoteJid.endsWith('@s.whatsapp.net')) continue;

      this.wsGateway.emitCRMEvent(branchRoom, 'crm:contact:update', {
        remoteJid,
        pushName: contact.pushName,
        profilePicUrl: contact.profilePicUrl,
      });
    }

    return { received: true };
  }

  @Public()
  @Post('messages-update')
  async handleMessagesUpdate(@Body() body: any) {
    const instanceName: string = body.instance || '';
    const branchId = await this.resolveBranchId(instanceName);
    if (!branchId) return { received: true };

    const branchRoom = `branch:${branchId}`;
    const updates = Array.isArray(body.data) ? body.data : [body.data];

    for (const upd of updates) {
      if (!upd) continue;
      const key = upd.key || {};
      const remoteJid = this.resolvePhoneJid(key, upd);
      if (!remoteJid) continue;

      this.wsGateway.emitCRMEvent(branchRoom, 'crm:message:status', {
        id: key.id || upd.keyId,
        remoteJid,
        status: this.mapStatus(upd.status || upd.update?.status),
      });
    }

    return { received: true };
  }

  @Public()
  @Post('chats-update')
  async handleChatsUpdate(@Body() body: any) {
    const instanceName: string = body.instance || '';
    const branchId = await this.resolveBranchId(instanceName);
    if (!branchId) return { received: true };

    const branchRoom = `branch:${branchId}`;
    const chats = Array.isArray(body.data) ? body.data : [body.data];

    for (const chat of chats) {
      if (!chat) continue;
      const remoteJid = this.resolvePhoneJid(chat, chat);
      if (!remoteJid) continue;

      this.wsGateway.emitCRMEvent(branchRoom, 'crm:chat:update', {
        remoteJid,
        unreadCount: chat.unreadCount,
      });
    }

    return { received: true };
  }

  @Public()
  @Post('presence-update')
  async handlePresenceUpdate(@Body() body: any) {
    const instanceName: string = body.instance || '';
    const branchId = await this.resolveBranchId(instanceName);
    if (!branchId) return { received: true };

    const branchRoom = `branch:${branchId}`;
    const data = body.data;
    if (!data) return { received: true };

    const rawJid: string = data.id || data.remoteJid || '';
    const remoteJid = rawJid.endsWith('@s.whatsapp.net')
      ? rawJid
      : (data.remoteJidAlt || '');
    if (!remoteJid.endsWith('@s.whatsapp.net')) return { received: true };

    const presences = data.presences || data.participant || [];
    let presenceState = 'unavailable';
    if (Array.isArray(presences)) {
      for (const p of presences) {
        if (p.presence === 'composing' || p.presence === 'recording') {
          presenceState = p.presence;
          break;
        }
        if (p.presence === 'available') {
          presenceState = 'available';
        }
      }
    } else if (typeof data.presence === 'string') {
      presenceState = data.presence;
    }

    this.wsGateway.emitCRMEvent(branchRoom, 'crm:presence', {
      remoteJid,
      presence: presenceState,
    });

    return { received: true };
  }

  @Public()
  @Post('send-message')
  async handleSendMessage(@Body() body: any) {
    const instanceName: string = body.instance || '';
    this.logger.log(`[WhatsAppWebhook] send-message received for instance: ${instanceName}`);

    const branchId = await this.resolveBranchId(instanceName);
    if (!branchId) {
      this.logger.warn(`[WhatsAppWebhook] Could not resolve branchId for instance: ${instanceName}`);
      return { received: true };
    }

    const branchRoom = `branch:${branchId}`;
    const data = body.data;

    if (!data) return { received: true };

    const key = data.key || {};
    const remoteJid = this.resolvePhoneJid(key, data);
    if (!remoteJid) return { received: true };

    const phone = remoteJid.replace('@s.whatsapp.net', '');
    const msg = data.message || {};
    const messageType = body.messageType || '';

    const payload = {
      id: key.id || String(Date.now()),
      remoteJid,
      fromMe: key.fromMe ?? false,
      text: this.extractText(msg),
      timestamp: data.messageTimestamp || Math.floor(Date.now() / 1000),
      pushName: data.pushName || '',
      phone,
      status: this.mapStatus(data.status),
      mediaType: this.detectMediaType(msg),
      mediaUrl: this.extractMediaUrl(msg),
    };

    console.log('[WhatsAppWebhook] (send-message) Emitting crm:message event:', JSON.stringify(payload, null, 2));
    this.wsGateway.emitCRMEvent(branchRoom, 'crm:message', payload);

    this.wsGateway.emitCRMEvent(branchRoom, 'crm:chat:update', {
      remoteJid,
      lastMessage: payload.text,
      lastMsgTimestamp: payload.timestamp,
      pushName: payload.pushName,
      phone,
    });

    return { received: true };
  }

  @Public()
  @Post('chats-upsert')
  async handleChatsUpsert(@Body() body: any) {
    const instanceName: string = body.instance || '';
    this.logger.log(`[WhatsAppWebhook] chats-upsert received for instance: ${instanceName}`);

    const branchId = await this.resolveBranchId(instanceName);
    if (!branchId) {
      this.logger.warn(`[WhatsAppWebhook] Could not resolve branchId for instance: ${instanceName}`);
      return { received: true };
    }

    const branchRoom = `branch:${branchId}`;
    const data = body.data;

    if (!data) return { received: true };

    // data is an array of chat objects
    const chats = Array.isArray(data) ? data : [data];

    for (const chat of chats) {
      const remoteJid = chat.remoteJid || '';
      if (!remoteJid.endsWith('@s.whatsapp.net')) continue;

      const phone = remoteJid.replace('@s.whatsapp.net', '');

      this.wsGateway.emitCRMEvent(branchRoom, 'crm:chat:update', {
        remoteJid,
        unreadMessages: chat.unreadMessages || 0,
        phone,
      });
    }

    return { received: true };
  }

  @Public()
  @Post()
  async handleWebhook(@Body() body: any) {
    const event = body.event;
    const instanceName: string = body.instance || '';
    if (!event) return { received: true };

    const branchId = await this.resolveBranchId(instanceName);
    if (!branchId) return { received: true };

    const branchRoom = `branch:${branchId}`;

    switch (event) {
      case 'messages.upsert': {
        const data = body.data;
        if (!data) break;

        const msg = data.message || data;
        const key = msg.key || data.key || {};

        const remoteJid = this.resolvePhoneJid(key, data);
        if (!remoteJid) break;

        const phone = remoteJid.replace('@s.whatsapp.net', '');

        const payload = {
          id: key.id || String(Date.now()),
          remoteJid,
          fromMe: key.fromMe ?? false,
          text: this.extractText(msg),
          timestamp: msg.messageTimestamp || Math.floor(Date.now() / 1000),
          pushName: msg.pushName || data.pushName || '',
          phone,
          status: key.fromMe ? 'sent' : 'received',
          mediaType: this.detectMediaType(msg),
          mediaUrl: this.extractMediaUrl(msg),
        };

        console.log('[WhatsAppWebhook] (handleWebhook) Emitting crm:message event:', JSON.stringify(payload, null, 2));
        this.wsGateway.emitCRMEvent(branchRoom, 'crm:message', payload);

        // Increment unread count in database for incoming messages
        if (!key.fromMe) {
          await this.incrementUnreadCount(branchId, remoteJid, payload.timestamp);
        }

        this.wsGateway.emitCRMEvent(branchRoom, 'crm:chat:update', {
          remoteJid,
          lastMessage: payload.text,
          lastMsgTimestamp: payload.timestamp,
          pushName: payload.pushName,
          phone,
        });
        break;
      }

      case 'MESSAGES_UPDATE': {
        const updates = Array.isArray(body.data) ? body.data : [body.data];
        for (const upd of updates) {
          if (!upd) continue;
          const key = upd.key || {};
          const remoteJid = this.resolvePhoneJid(key, upd);
          if (!remoteJid) continue;

          this.wsGateway.emitCRMEvent(branchRoom, 'crm:message:status', {
            id: key.id,
            remoteJid,
            status: this.mapStatus(upd.update?.status),
          });
        }
        break;
      }

      case 'presence.update': {
        const data = body.data;
        if (!data) break;

        const rawJid: string = data.id || data.remoteJid || '';
        const remoteJid = rawJid.endsWith('@s.whatsapp.net')
          ? rawJid
          : (data.remoteJidAlt || '');
        if (!remoteJid.endsWith('@s.whatsapp.net')) break;

        const presences = data.presences || data.participant || [];
        let presenceState = 'unavailable';
        if (Array.isArray(presences)) {
          for (const p of presences) {
            if (p.presence === 'composing' || p.presence === 'recording') {
              presenceState = p.presence;
              break;
            }
            if (p.presence === 'available') {
              presenceState = 'available';
            }
          }
        } else if (typeof data.presence === 'string') {
          presenceState = data.presence;
        }

        this.wsGateway.emitCRMEvent(branchRoom, 'crm:presence', {
          remoteJid,
          presence: presenceState,
        });
        break;
      }

      case 'chats.update': {
        const chats = Array.isArray(body.data) ? body.data : [body.data];
        for (const chat of chats) {
          if (!chat) continue;
          const remoteJid = this.resolvePhoneJid(chat, chat);
          if (!remoteJid) continue;

          this.wsGateway.emitCRMEvent(branchRoom, 'crm:chat:update', {
            remoteJid,
            unreadCount: chat.unreadCount,
          });
        }
        break;
      }

      default:
        this.logger.debug(`[Webhook] Unhandled event: ${event}`);
    }

    return { received: true };
  }

  // ─── Helpers ─────────────────────────────────────────────────

  /**
   * Resolve the @s.whatsapp.net JID from a key/data object.
   * Incoming LID messages have remoteJid = "123@lid" and remoteJidAlt = "55...@s.whatsapp.net".
   * Returns null for group messages and status broadcasts.
   */
  private resolvePhoneJid(key: any, data: any): string | null {
    const jid: string = key.remoteJid || data.remoteJid || '';
    if (jid.endsWith('@s.whatsapp.net')) return jid;

    // LID format — use remoteJidAlt or participantAlt
    const alt: string =
      key.remoteJidAlt || data.remoteJidAlt ||
      key.participantAlt || data.participantAlt || '';
    if (alt.endsWith('@s.whatsapp.net')) return alt;

    return null;
  }

  private async resolveBranchId(instanceName: string): Promise<string | null> {
    this.logger.log(`[Webhook] resolveBranchId called with instanceName: ${instanceName}`);
    
    // Instance name format: anotaja_{branchId}
    if (instanceName.startsWith('anotaja_')) {
      const branchId = instanceName.replace('anotaja_', '');
      this.logger.log(`[Webhook] Extracted branchId from instance name: ${branchId}`);
      return branchId;
    }

    // Fallback: lookup in DB
    try {
      const config = await prisma.whatsAppConfig.findFirst({
        where: { instanceName },
        select: { branchId: true },
      });
      
      if (!config?.branchId) {
        this.logger.warn(`[Webhook] No config found for instanceName: ${instanceName}`);
        return null;
      }
      
      this.logger.log(`[Webhook] Found branchId from DB: ${config.branchId} for instanceName: ${instanceName}`);
      return config.branchId;
    } catch (error) {
      this.logger.error(`[Webhook] Error in DB lookup for instanceName ${instanceName}:`, error);
      return null;
    }
  }

  private async markBranchAsDisconnected(branchId: string) {
    try {
      await prisma.whatsAppConfig.update({
        where: { branchId },
        data: {
          status: 'disconnected',
          qrCode: null,
          phoneNumber: null,
          profileName: null,
          profilePicUrl: null,
        },
      });
      this.logger.log(`[Webhook] Branch ${branchId} marked as disconnected`);
    } catch (error) {
      this.logger.error(`[Webhook] Failed to mark branch ${branchId} as disconnected:`, error);
    }
  }

  private extractText(msg: any): string {
    if (!msg) return '';
    const m = msg.message || msg;
    return (
      m.conversation ||
      m.extendedTextMessage?.text ||
      m.imageMessage?.caption ||
      m.videoMessage?.caption ||
      m.documentMessage?.caption ||
      m.documentMessage?.title ||
      m.contactMessage?.displayName ||
      m.locationMessage?.name ||
      ''
    );
  }

  private detectMediaType(msg: any): string {
    const m = msg.message || msg || {};
    if (m.imageMessage) return 'image';
    if (m.documentMessage) return 'document';
    if (m.audioMessage) return 'audio';
    if (m.videoMessage) return 'video';
    if (m.locationMessage) return 'location';
    if (m.contactMessage) return 'contact';
    if (m.stickerMessage) return 'sticker';
    return 'text';
  }

  private extractMediaUrl(msg: any): string | null {
    const m = msg.message || msg || {};
    if (m.imageMessage?.url) return m.imageMessage.url;
    if (m.videoMessage?.url) return m.videoMessage.url;
    if (m.audioMessage?.url) return m.audioMessage.url;
    if (m.documentMessage?.url) return m.documentMessage.url;
    return null;
  }

  private async incrementUnreadCount(branchId: string, jid: string, timestamp: number) {
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
          unreadCount: 1,
          lastMessageAt: new Date(timestamp * 1000),
        },
        update: {
          unreadCount: {
            increment: 1,
          },
          lastMessageAt: new Date(timestamp * 1000),
        },
      });
    } catch (error) {
      this.logger.error(`[Webhook] Failed to increment unread count for ${jid}:`, error);
    }
  }

  private mapStatus(status?: number | string): string {
  // Numérico
  if (typeof status === 'number') {
    switch (status) {
      case 0: return 'error';
      case 1: return 'pending';
      case 2: return 'sent';     // SERVER_ACK
      case 3: return 'received'; // DELIVERY_ACK
      case 4:
      case 5: return 'read';
      default: return 'sent';
    }
  }
 
  // String
  const s = String(status || '').toUpperCase();
    if (s === 'ERROR') return 'error';
    if (s === 'PENDING') return 'pending';
    if (s === 'SERVER_ACK') return 'sent';
    if (s === 'DELIVERY_ACK') return 'received'; // CORRIGIDO
    if (s === 'READ' || s === 'PLAYED') return 'read';
    return 'sent';
  } 
}
