import { Controller, Post, Body, Logger } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { OrdersWebSocketGateway } from '../websocket/websocket.gateway';
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
@Controller('api/webhook')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(private readonly wsGateway: OrdersWebSocketGateway) {}

  @Public()
  @Post('contacts-update')
  async handleContactsUpdate(@Body() body: any) {
    this.logger.log('[Webhook] Contacts update received:', JSON.stringify(body).slice(0, 500));
    
    const instanceName: string = body.instance || '';
    const branchId = await this.resolveBranchId(instanceName);
    if (!branchId) {
      this.logger.warn(`[Webhook] Could not resolve branchId for instance: ${instanceName}`);
      return { received: true };
    }

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
  @Post('chats-update')
  async handleChatsUpdate(@Body() body: any) {
    this.logger.log('[Webhook] Chats update received:', JSON.stringify(body).slice(0, 500));
    
    const instanceName: string = body.instance || '';
    const branchId = await this.resolveBranchId(instanceName);
    if (!branchId) {
      this.logger.warn(`[Webhook] Could not resolve branchId for instance: ${instanceName}`);
      return { received: true };
    }

    const branchRoom = `branch:${branchId}`;
    const chats = Array.isArray(body.data) ? body.data : [body.data];

    for (const chat of chats) {
      if (!chat) continue;
      const remoteJid = chat.remoteJid || chat.id || '';
      if (!remoteJid.endsWith('@s.whatsapp.net')) continue;

      this.wsGateway.emitCRMEvent(branchRoom, 'crm:chat:update', {
        remoteJid,
        unreadCount: chat.unreadCount,
      });
    }

    return { received: true };
  }

  @Public()
  @Post()
  async handleWebhook(@Body() body: any) {
    this.logger.log('[Webhook] Received webhook:', JSON.stringify(body).slice(0, 500));
    
    const event = body.event;
    const instanceName: string = body.instance || '';

    if (!event) {
      this.logger.warn('[Webhook] No event field in webhook body');
      return { received: true };
    }

    this.logger.log(`[Webhook] Event: ${event} | Instance: ${instanceName}`);

    // Resolve branchId from instance name (format: anotaja_{branchId})
    const branchId = await this.resolveBranchId(instanceName);
    if (!branchId) {
      this.logger.warn(`[Webhook] Could not resolve branchId for instance: ${instanceName}`);
      return { received: true };
    }

    this.logger.log(`[Webhook] Resolved branchId: ${branchId}`);
    const branchRoom = `branch:${branchId}`;

    switch (event) {
      case 'MESSAGES_UPSERT': {
        const data = body.data;
        if (!data) break;

        const msg = data.message || data;
        const key = msg.key || {};
        const remoteJid: string = key.remoteJid || data.remoteJid || '';

        // Skip group messages and status broadcasts
        if (!remoteJid.endsWith('@s.whatsapp.net')) break;

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
        };

        this.logger.log(
          `[Webhook] Message ${payload.fromMe ? '→' : '←'} ${phone}: ${(payload.text || '').slice(0, 50)}`,
        );

        this.logger.log(`[Webhook] Emitting crm:message to room: ${branchRoom}`);
        this.wsGateway.emitCRMEvent(branchRoom, 'crm:message', payload);
        this.logger.log(`[Webhook] Emitted crm:message`);

        // Also emit chat update so sidebar refreshes
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
          const remoteJid: string = key.remoteJid || '';
          if (!remoteJid.endsWith('@s.whatsapp.net')) continue;

          this.wsGateway.emitCRMEvent(branchRoom, 'crm:message:status', {
            id: key.id,
            remoteJid,
            status: this.mapStatus(upd.update?.status),
          });
        }
        break;
      }

      case 'PRESENCE_UPDATE': {
        const data = body.data;
        if (!data) break;

        const remoteJid: string = data.id || data.remoteJid || '';
        if (!remoteJid.endsWith('@s.whatsapp.net')) break;

        // participant array: [{ id, presence }]
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
          presence: presenceState, // composing | recording | available | unavailable
        });
        break;
      }

      case 'CHATS_UPDATE': {
        const chats = Array.isArray(body.data) ? body.data : [body.data];
        for (const chat of chats) {
          if (!chat) continue;
          const remoteJid = chat.remoteJid || chat.id || '';
          if (!remoteJid.endsWith('@s.whatsapp.net')) continue;

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

  private async resolveBranchId(instanceName: string): Promise<string | null> {
    // Instance name format: anotaja_{branchId}
    if (instanceName.startsWith('anotaja_')) {
      return instanceName.replace('anotaja_', '');
    }

    // Fallback: lookup in DB
    try {
      const config = await prisma.whatsAppConfig.findFirst({
        where: { instanceName },
        select: { branchId: true },
      });
      return config?.branchId ?? null;
    } catch {
      return null;
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

  private mapStatus(status?: number): string {
    switch (status) {
      case 0: return 'error';
      case 1: return 'pending';
      case 2: return 'sent';
      case 3: return 'received';
      case 4:
      case 5: return 'read';
      default: return 'sent';
    }
  }
}
