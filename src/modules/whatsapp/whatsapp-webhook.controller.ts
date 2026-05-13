import { Controller, Post, Body, Logger } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { OrdersWebSocketGateway } from '../websocket/websocket.gateway';
import { prisma } from '../../../lib/prisma';

/**
 * Webhook receiver for Evolution API events.
 *
 * Evolution API envia todos os eventos para um único endpoint (POST /)
 * via `webhook_by_events: false`, com o campo `event` no body.
 *
 * Endpoints individuais (messages-upsert, etc.) são mantidos para
 * compatibilidade com configurações `webhook_by_events: true`.
 *
 * Fluxo principal:
 *   POST / → switch(event) → handler específico
 *
 * Invariantes importantes:
 *   - Timestamps são SEMPRE armazenados em milissegundos no banco.
 *   - JIDs de grupo (@g.us) e status broadcast são sempre ignorados.
 *   - ChatLastMessage é a fonte de verdade para a última mensagem de cada conversa.
 *   - WhatsAppMessage guarda o histórico completo (enviados + recebidos).
 */
@Controller('whatsapp/webhook')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(private readonly wsGateway: OrdersWebSocketGateway) {}

  // ─── Entry point único (webhook_by_events: false) ────────────────────────────

  @Public()
  @Post()
  async handleWebhook(@Body() body: any) {
    const event: string = body?.event ?? '';
    const instanceName: string = body?.instance ?? '';
    const data = body?.data;

    if (!event || !data) return { received: true };

    const branchId = await this.resolveBranchId(instanceName);
    if (!branchId) return { received: true };

    try {
      switch (event) {
        case 'messages.upsert':
          await this.onMessageUpsert(branchId, data);
          break;

        case 'messages.update':
          await this.onMessageUpdate(branchId, data);
          break;

        case 'send.message':
        case 'SEND_MESSAGE':
          await this.onSendMessage(branchId, data);
          break;

        case 'presence.update':
          await this.onPresenceUpdate(branchId, data);
          break;

        case 'chats.update':
        case 'chats.upsert':
          await this.onChatsUpdate(branchId, data);
          break;

        case 'contacts.update':
          await this.onContactsUpdate(branchId, data);
          break;

        default:
          // Evento não tratado — ignora silenciosamente
          break;
      }
    } catch (err) {
      // Nunca deixa o webhook falhar (Evolution API reintentaria)
      this.logger.error(`[Webhook] Erro ao processar evento "${event}":`, err);
    }

    return { received: true };
  }

  // ─── Endpoints individuais (webhook_by_events: true) ─────────────────────────
  // Cada endpoint delega para o mesmo handler interno, garantindo comportamento idêntico.

  @Public()
  @Post('messages-upsert')
  async handleMessagesUpsert(@Body() body: any) {
    const branchId = await this.resolveBranchId(body?.instance ?? '');
    if (!branchId || !body?.data) return { received: true };
    await this.onMessageUpsert(branchId, body.data).catch(this.logError('messages-upsert'));
    return { received: true };
  }

  @Public()
  @Post('messages-update')
  async handleMessagesUpdate(@Body() body: any) {
    const branchId = await this.resolveBranchId(body?.instance ?? '');
    if (!branchId || !body?.data) return { received: true };
    await this.onMessageUpdate(branchId, body.data).catch(this.logError('messages-update'));
    return { received: true };
  }

  @Public()
  @Post('send-message')
  async handleSendMessage(@Body() body: any) {
    const branchId = await this.resolveBranchId(body?.instance ?? '');
    if (!branchId || !body?.data) return { received: true };
    await this.onSendMessage(branchId, body.data).catch(this.logError('send-message'));
    return { received: true };
  }

  @Public()
  @Post('presence-update')
  async handlePresenceUpdate(@Body() body: any) {
    const branchId = await this.resolveBranchId(body?.instance ?? '');
    if (!branchId || !body?.data) return { received: true };
    await this.onPresenceUpdate(branchId, body.data).catch(this.logError('presence-update'));
    return { received: true };
  }

  @Public()
  @Post('chats-update')
  async handleChatsUpdate(@Body() body: any) {
    const branchId = await this.resolveBranchId(body?.instance ?? '');
    if (!branchId || !body?.data) return { received: true };
    await this.onChatsUpdate(branchId, body.data).catch(this.logError('chats-update'));
    return { received: true };
  }

  @Public()
  @Post('chats-upsert')
  async handleChatsUpsert(@Body() body: any) {
    const branchId = await this.resolveBranchId(body?.instance ?? '');
    if (!branchId || !body?.data) return { received: true };
    await this.onChatsUpdate(branchId, body.data).catch(this.logError('chats-upsert'));
    return { received: true };
  }

  @Public()
  @Post('contacts-update')
  async handleContactsUpdate(@Body() body: any) {
    const branchId = await this.resolveBranchId(body?.instance ?? '');
    if (!branchId || !body?.data) return { received: true };
    await this.onContactsUpdate(branchId, body.data).catch(this.logError('contacts-update'));
    return { received: true };
  }

  // ─── Handlers internos ───────────────────────────────────────────────────────

  /**
   * Mensagem nova recebida OU enviada pelo dispositivo (não pelo servidor).
   *
   * O Evolution API envia este evento tanto para mensagens recebidas
   * quanto para mensagens enviadas manualmente pelo app do celular.
   * Mensagens enviadas via API chegam no evento send.message / SEND_MESSAGE.
   */
  private async onMessageUpsert(branchId: string, data: any) {
    const msg = data?.message ?? data;
    const key = msg?.key ?? data?.key;

    if (!key?.id) return;

    const remoteJid = this.resolveJid(key, data);
    if (!remoteJid) return; // grupo ou status broadcast

    const messageId: string = key.id;
    const fromMe: boolean = key.fromMe ?? false;
    const timestampMs = this.toMs(msg.messageTimestamp ?? data.messageTimestamp);
    const text = this.extractText(msg);
    const pushName: string = msg.pushName ?? data.pushName ?? '';
    const phone = remoteJid.replace('@s.whatsapp.net', '');
    const mediaType = this.detectMediaType(msg);
    const mediaUrl = this.extractMediaUrl(msg);

    // 1. Persiste mensagem
    await this.upsertMessage({
      id: messageId,
      branchId,
      remoteJid,
      fromMe,
      text,
      pushName,
      phone,
      timestampMs,
    });

    // 2. Atualiza última mensagem da conversa
    await this.upsertLastMessage({
      branchId,
      remoteJid,
      messageId,
      text,
      timestampMs,
      fromMe,
      pushName,
    });

    // 3. Incrementa não-lidas (apenas mensagens recebidas)
    if (!fromMe) {
      await this.incrementUnread(branchId, remoteJid, timestampMs);
    }

    // 4. Tempo real via WebSocket
    const room = `branch:${branchId}`;

    this.wsGateway.emitCRMEvent(room, 'crm:message', {
      id: messageId,
      remoteJid,
      fromMe,
      text,
      timestamp: timestampMs,
      pushName,
      phone,
      status: fromMe ? 'sent' : 'received',
      mediaType,
      mediaUrl,
    });

    this.wsGateway.emitCRMEvent(room, 'crm:chat:update', {
      remoteJid,
      phone,
      pushName,
      lastMessage: {
        id: messageId,
        text,
        timestamp: timestampMs,
        fromMe,
        pushName,
      },
    });
  }

  /**
   * Mensagem enviada pelo servidor (via API) — confirmação de entrega.
   * Estrutura ligeiramente diferente do messages.upsert.
   */
  private async onSendMessage(branchId: string, data: any) {
    const key = data?.key ?? {};
    const remoteJid = this.resolveJid(key, data);
    if (!remoteJid) return;

    const messageId: string = key.id ?? String(Date.now());
    const fromMe = true; // send.message é sempre do servidor
    const timestampMs = this.toMs(
      data.messageTimestamp ?? data.epoch ?? data.timestamp
    );
    const msg = data.message ?? {};
    const text = this.extractText(msg) || this.extractText(data);
    const pushName: string = data.pushName ?? '';
    const phone = remoteJid.replace('@s.whatsapp.net', '');
    const status = this.mapStatus(data.status);
    const mediaType = this.detectMediaType(msg);
    const mediaUrl = this.extractMediaUrl(msg);

    // Persiste (pode já existir se criado otimisticamente pelo sendCrmMessage)
    await this.upsertMessage({
      id: messageId,
      branchId,
      remoteJid,
      fromMe,
      text,
      pushName,
      phone,
      timestampMs,
    });

    // Atualiza última mensagem
    await this.upsertLastMessage({
      branchId,
      remoteJid,
      messageId,
      text,
      timestampMs,
      fromMe,
      pushName,
    });

    const room = `branch:${branchId}`;

    this.wsGateway.emitCRMEvent(room, 'crm:message', {
      id: messageId,
      remoteJid,
      fromMe,
      text,
      timestamp: timestampMs,
      pushName,
      phone,
      status,
      mediaType,
      mediaUrl,
    });

    this.wsGateway.emitCRMEvent(room, 'crm:chat:update', {
      remoteJid,
      phone,
      pushName,
      lastMessage: {
        id: messageId,
        text,
        timestamp: timestampMs,
        fromMe,
        pushName,
      },
    });
  }

  /**
   * Atualização de status de mensagem (enviada → entregue → lida).
   */
  private async onMessageUpdate(branchId: string, data: any) {
    const updates = Array.isArray(data) ? data : [data];
    const room = `branch:${branchId}`;

    for (const upd of updates) {
      const key = upd?.key;
      if (!key?.id) continue;

      const remoteJid = this.resolveJid(key, upd);
      if (!remoteJid) continue;

      const rawStatus = upd.update?.status ?? upd.status;
      const status = this.mapStatus(rawStatus);

      this.wsGateway.emitCRMEvent(room, 'crm:message:status', {
        id: key.id,
        remoteJid,
        status,
      });

      // Se todas as mensagens foram lidas (READ), zera contador de não-lidas
      if (status === 'read' && !key.fromMe) {
        await this.resetUnread(branchId, remoteJid);
      }
    }
  }

  /**
   * Status de digitação/presença do contato.
   */
  private async onPresenceUpdate(branchId: string, data: any) {
    const remoteJid = this.resolveJid(data, data);
    if (!remoteJid) return;

    // Evolution API pode enviar presença aninhada em presences[]
    let presence = 'unavailable';
    const presences = data.presences ?? data.participant ?? [];

    if (Array.isArray(presences)) {
      for (const p of presences) {
        if (p.presence === 'composing' || p.presence === 'recording') {
          presence = p.presence;
          break;
        }
        if (p.presence === 'available') {
          presence = 'available';
        }
      }
    } else if (typeof data.presence === 'string') {
      presence = data.presence;
    }

    this.wsGateway.emitCRMEvent(`branch:${branchId}`, 'crm:presence', {
      remoteJid,
      presence,
    });
  }

  /**
   * Atualização de metadados de chats (unread count, nome, etc.).
   */
  private async onChatsUpdate(branchId: string, data: any) {
    const chats = Array.isArray(data) ? data : [data];
    const room = `branch:${branchId}`;

    for (const chat of chats) {
      const remoteJid = this.resolveJid(chat, chat);
      if (!remoteJid) continue;

      this.wsGateway.emitCRMEvent(room, 'crm:chat:update', {
        remoteJid,
        phone: remoteJid.replace('@s.whatsapp.net', ''),
        unreadCount: chat.unreadCount ?? chat.unreadMessages ?? undefined,
      });
    }
  }

  /**
   * Atualização de perfil de contato.
   */
  private async onContactsUpdate(branchId: string, data: any) {
    const contacts = Array.isArray(data) ? data : [data];
    const room = `branch:${branchId}`;

    for (const contact of contacts) {
      if (!contact) continue;
      const remoteJid: string = contact.remoteJid ?? contact.id ?? '';
      if (!remoteJid.endsWith('@s.whatsapp.net')) continue;

      this.wsGateway.emitCRMEvent(room, 'crm:contact:update', {
        remoteJid,
        pushName: contact.pushName ?? null,
        profilePicUrl: contact.profilePicUrl ?? null,
      });
    }
  }

  // ─── Persistência ────────────────────────────────────────────────────────────

  private async upsertMessage(params: {
    id: string;
    branchId: string;
    remoteJid: string;
    fromMe: boolean;
    text: string;
    pushName: string;
    phone: string;
    timestampMs: number;
  }) {
    const { id, branchId, remoteJid, fromMe, text, pushName, phone, timestampMs } = params;

    await prisma.whatsAppMessage.upsert({
      where: { id },
      create: {
        id,
        branchId,
        remoteJid,
        fromMe,
        text: text || '',
        message: text || '',
        pushName,
        customerPhone: phone,
        status: fromMe ? 'sent' : 'received',
        sentAt: new Date(timestampMs),
      },
      update: {
        // Só atualiza campos que podem mudar (evita sobrescrever status)
        text: text || '',
        message: text || '',
        pushName,
      },
    });
  }

  private async upsertLastMessage(params: {
    branchId: string;
    remoteJid: string;
    messageId: string;
    text: string;
    timestampMs: number;
    fromMe: boolean;
    pushName: string;
  }) {
    const { branchId, remoteJid, messageId, text, timestampMs, fromMe, pushName } = params;

    await prisma.chatLastMessage.upsert({
      where: { remoteJid },
      create: {
        branchId,
        remoteJid,
        messageId,
        text: text || null,
        timestamp: timestampMs, // sempre em ms
        fromMe,
        pushName: pushName || null,
      },
      update: {
        // Só sobrescreve se a nova mensagem for mais recente
        // (evita race condition quando dois webhooks chegam fora de ordem)
        messageId,
        text: text || null,
        timestamp: timestampMs,
        fromMe,
        pushName: pushName || null,
      },
    });
  }

  private async incrementUnread(branchId: string, jid: string, timestampMs: number) {
    try {
      await prisma.whatsAppChatRead.upsert({
        where: { branchId_jid: { branchId, jid } },
        create: {
          branchId,
          jid,
          unreadCount: 1,
          lastMessageAt: new Date(timestampMs),
        },
        update: {
          unreadCount: { increment: 1 },
          lastMessageAt: new Date(timestampMs),
        },
      });
    } catch (err) {
      // Não crítico — loga e continua
      this.logger.warn('[Webhook] incrementUnread falhou:', err);
    }
  }

  private async resetUnread(branchId: string, jid: string) {
    try {
      await prisma.whatsAppChatRead.updateMany({
        where: { branchId, jid },
        data: { unreadCount: 0, lastReadAt: new Date() },
      });
    } catch {
      // Silencioso — não crítico
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Resolve o branchId a partir do nome da instância.
   *
   * Suporta dois formatos:
   *   - `anotaja_{branchId}`  → prefixo usado em setup()
   *   - `vaidelli_{branchId}` → prefixo legado
   *   - Fallback: consulta o banco
   */
  private async resolveBranchId(instanceName: string): Promise<string | null> {
    if (!instanceName) return null;

    for (const prefix of ['anotaja_', 'vaidelli_']) {
      if (instanceName.startsWith(prefix)) {
        return instanceName.slice(prefix.length);
      }
    }

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

  /**
   * Resolve o JID no formato @s.whatsapp.net a partir de key/data.
   *
   * Retorna null para:
   *   - Mensagens de grupo (@g.us)
   *   - Status broadcasts (status@broadcast)
   *   - JIDs sem formato @s.whatsapp.net nem @lid com alternativa
   */
  private resolveJid(key: any, data: any): string | null {
    const candidates: string[] = [
      key?.remoteJid,
      key?.remoteJidAlt,
      key?.participantAlt,
      data?.remoteJid,
      data?.remoteJidAlt,
      data?.id,
    ].filter(Boolean);

    for (const jid of candidates) {
      if (typeof jid !== 'string') continue;
      if (jid.endsWith('@g.us')) return null;       // grupo
      if (jid === 'status@broadcast') return null;  // status
      if (jid.endsWith('@s.whatsapp.net')) return jid;
    }

    return null;
  }

  /**
   * Normaliza qualquer timestamp para milissegundos.
   * Evolution API pode enviar segundos (10 dígitos) ou ms (13 dígitos).
   */
  private toMs(ts: any): number {
    if (!ts) return Date.now();
    const n = Number(ts);
    if (isNaN(n) || n <= 0) return Date.now();
    // Timestamps Unix em segundos têm 10 dígitos (até 2001-09-09 era 10^9)
    // Após 2001 e antes de 2317, segundos têm 10 dígitos, ms têm 13.
    return n < 10_000_000_000 ? n * 1000 : n;
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
      m.contactMessage?.displayName ||
      m.locationMessage?.name ||
      m.audioMessage?.caption ||
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
    return (
      m.imageMessage?.url ??
      m.videoMessage?.url ??
      m.audioMessage?.url ??
      m.documentMessage?.url ??
      m.stickerMessage?.url ??
      null
    );
  }

  /**
   * Mapeia status numérico ou string da Evolution API para nosso domínio.
   *
   * Numérico (Baileys):
   *   0 = ERROR, 1 = PENDING, 2 = SERVER_ACK (sent),
   *   3 = DELIVERY_ACK (received), 4 = READ, 5 = PLAYED
   */
  private mapStatus(status?: number | string): string {
    if (typeof status === 'number') {
      const map: Record<number, string> = {
        0: 'error',
        1: 'pending',
        2: 'sent',
        3: 'received',
        4: 'read',
        5: 'read',
      };
      return map[status] ?? 'sent';
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

  private logError(context: string) {
    return (err: any) => {
      this.logger.error(`[Webhook:${context}] Erro:`, err);
    };
  }
}