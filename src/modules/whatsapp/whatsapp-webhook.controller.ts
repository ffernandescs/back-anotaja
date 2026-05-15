import { Controller, Post, Body, Logger } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { OrdersWebSocketGateway } from '../websocket/websocket.gateway';
import { prisma } from '../../../lib/prisma';
import { WhatsAppService } from './whatsapp.service';
import {
  isGroupJid,
  isInstanceDisplayName,
  isLidJid,
  isPhoneJid,
  phoneFromJid,
} from 'src/utils/whatsapp-jid.util';

@Controller('whatsapp/webhook')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(
    private readonly wsGateway: OrdersWebSocketGateway,
    private readonly whatsappService: WhatsAppService,
  ) {}

  // ─────────────────────────────────────────────
  // ENTRYPOINT PRINCIPAL DO WEBHOOK
  // ─────────────────────────────────────────────
  /**
   * Aqui chegam TODOS os eventos da Evolution API.
   * Ex:
   * - messages.upsert (mensagem recebida/enviada)
   * - send.message (mensagem enviada via API)
   * - messages.update (status: read/delivered)
   */
  @Public()
  @Post()
  async handleWebhook(@Body() body: any) {
    const event = body?.event; // tipo do evento
    const data = body?.data; // payload do evento
    const instanceName = body?.instance; // instância do WhatsApp

    // Se não tiver evento ou dados, ignora
    if (!event || !data) return { received: true };

    // Descobre qual branch (loja/cliente) está recebendo evento
    const branchId = await this.resolveBranchId(instanceName);
    if (!branchId) return { received: true };

    try {
      // Roteia todos os eventos importantes
      switch (event) {
        /**
         * MENSAGEM RECEBIDA OU ENVIADA PELO WHATSAPP
         * (inclui mensagens do celular também)
         */
        case 'messages.upsert':
        case 'send.message':
        case 'SEND_MESSAGE':
          await this.handleMessage(branchId, data, body);
          break;

        /**
         * STATUS DA MENSAGEM
         * (enviada, entregue, lida)
         */
        case 'messages.update':
        case 'MESSAGES_UPDATE':
          await this.handleMessageStatus(branchId, data, body);
          break;

        case 'presence.update':
        case 'PRESENCE_UPDATE':
          await this.handlePresence(branchId, data);
          break;

        default:
          // ignora eventos não utilizados
          break;
      }
    } catch (err) {
      // Nunca quebra webhook (Evolution tenta reenviar)
      this.logger.error('[Webhook] erro:', err);
    }

    return { received: true };
  }

  // ─────────────────────────────────────────────
  // MENSAGEM PRINCIPAL (ENTRADA E SAÍDA)
  // ─────────────────────────────────────────────
  /**
   * Essa função é o CORE do sistema.
   * Aqui tratamos:
   * - mensagem recebida do cliente
   * - mensagem enviada pelo usuário
   *
   * Sempre atualiza:
   * - histórico da mensagem
   * - lastMessage do chat
   * - unread count (se necessário)
   * - websocket em tempo real
   */
  private async handleMessage(branchId: string, data: any, webhookBody?: any) {
    const msg = data?.message ?? data; // mensagem normalizada
    const key = msg?.key ?? data?.key; // metadata da mensagem

    // se não tiver ID, ignora
    if (!key?.id) return;

    const fromMe = !!key.fromMe;

    const config = await prisma.whatsAppConfig.findUnique({
      where: { branchId },
      select: { id: true, instanceName: true, phoneNumber: true, profileName: true },
    });

    const originalJid = key?.remoteJid || data?.remoteJid;

    // O campo "sender" no root do webhook é a INSTÂNCIA Evolution (seu 95821711),
    // NÃO o cliente que enviou. Nunca usar como telefone do contato.

    const remoteJid = config?.instanceName
      ? await this.whatsappService.resolveContactJid(
          config.instanceName,
          key,
          data,
          config.phoneNumber,
        )
      : this.resolveJidFallback(key, data);

    if (!remoteJid) {
      return;
    }

    if (
      config?.instanceName &&
      originalJid &&
      isLidJid(originalJid) &&
      isPhoneJid(remoteJid)
    ) {
      this.whatsappService.rememberLidPair(
        config.instanceName,
        originalJid,
        remoteJid,
        config.phoneNumber,
      );
    }

    const syncJids =
      config?.instanceName
        ? await this.whatsappService.collectSyncJids(
            config.instanceName,
            remoteJid,
            key,
            data,
            config.phoneNumber,
          )
        : [remoteJid];

    const messageId = key.id; // id único da mensagem

    // converte timestamp (segundos/ms → ms padrão)
    const timestampMs = this.toMs(
      msg.messageTimestamp ?? data.messageTimestamp,
    );

    // extrai texto da mensagem (texto, imagem caption etc)
    const text = this.extractText(msg);

    const rawPushName = msg.pushName ?? data.pushName ?? '';
    const contactPushName = await this.resolveContactPushName(
      syncJids,
      fromMe,
      rawPushName,
      config?.profileName,
      config?.phoneNumber,
    );

    // telefone limpo — nunca usar dígitos do @lid como telefone
    const phone = isPhoneJid(remoteJid)
      ? phoneFromJid(remoteJid).replace(/^55/, '')
      : '';

    // ─────────────────────────────────────────
    // 1. SALVA HISTÓRICO DA MENSAGEM
    // ─────────────────────────────────────────
    await this.upsertMessage({
      id: messageId,
      branchId,
      remoteJid,
      fromMe,
      text,
      pushName: contactPushName || rawPushName,
      phone,
      timestampMs,
    });

    // ─────────────────────────────────────────
    // 2. ATUALIZA LAST MESSAGE DO CHAT (telefone + @lid)
    // ─────────────────────────────────────────
    const lastMsgPayload = {
      branchId,
      messageId,
      text,
      timestampMs,
      fromMe,
      pushName: contactPushName,
    };
    for (const jid of syncJids) {
      await this.upsertLastMessage({ ...lastMsgPayload, remoteJid: jid });
    }

    // ─────────────────────────────────────────
    // 3. CONTADOR DE NÃO LIDAS
    // só aumenta se mensagem veio do cliente
    // ─────────────────────────────────────────
    if (!fromMe && config?.id) {
      for (const jid of syncJids) {
        await this.incrementUnread(config.id, jid, timestampMs);
      }
    }

    // ─────────────────────────────────────────
    // 4. WEBSOCKET (tempo real)
    // envia para frontend imediatamente
    // ─────────────────────────────────────────
    const room = `branch:${branchId}`;
    const wsMeta = {
      branchId,
      instanceName: config?.instanceName,
    };

    const msgStatus = fromMe
      ? this.mapStatus(data?.status ?? msg?.status)
      : 'received';

    const lidJidForWs =
      originalJid && isLidJid(originalJid)
        ? originalJid
        : isLidJid(remoteJid)
          ? remoteJid
          : undefined;

    this.wsGateway.emitCRMEvent(room, 'crm:message', {
      ...wsMeta,
      id: messageId,
      remoteJid,
      lidJid: lidJidForWs,
      fromMe,
      text,
      timestamp: timestampMs,
      pushName: contactPushName || rawPushName,
      phone: isPhoneJid(remoteJid) ? phone : '',
      status: msgStatus,
    });

    // atualização do chat (lista da esquerda) — emite para todos os JIDs do mesmo contato
    const chatUpdate = {
      lastMessage: {
        id: messageId,
        text,
        timestamp: timestampMs,
        fromMe,
        pushName: contactPushName || rawPushName,
      },
    };
    for (const jid of syncJids) {
      const unreadForJid =
        !fromMe && config?.id
          ? await this.getUnreadCount(config.id, jid)
          : undefined;

      this.wsGateway.emitCRMEvent(room, 'crm:chat:update', {
        ...wsMeta,
        remoteJid: jid,
        jid,
        lidJid:
          originalJid && isLidJid(originalJid)
            ? originalJid
            : isLidJid(jid)
              ? jid
              : undefined,
        ...(contactPushName ? { name: contactPushName } : {}),
        phone: isPhoneJid(remoteJid) ? phone : '',
        lastMsgTimestamp: timestampMs,
        ...(unreadForJid !== undefined ? { unreadCount: unreadForJid } : {}),
        ...chatUpdate,
      });
    }
  }

  // ─────────────────────────────────────────────
  // STATUS DA MENSAGEM (READ / DELIVERED)
  // ─────────────────────────────────────────────
  /**
   * Atualiza status das mensagens:
   * - sent
   * - received
   * - read
   */
  private async handleMessageStatus(branchId: string, data: any, webhookBody?: any) {
    const updates = Array.isArray(data) ? data : [data];
    const room = `branch:${branchId}`;

    for (const upd of updates) {
      const messageId = upd?.key?.id ?? upd?.keyId ?? upd?.messageId;
      if (!messageId) continue;

      const key = {
        ...(upd?.key ?? {}),
        id: messageId,
        remoteJid: upd?.key?.remoteJid ?? upd?.remoteJid,
        fromMe: upd?.key?.fromMe ?? upd?.fromMe ?? false,
        participant: upd?.key?.participant ?? upd?.participant,
      };

      const config = await prisma.whatsAppConfig.findUnique({
        where: { branchId },
        select: { id: true, instanceName: true, phoneNumber: true },
      });

      const wsMeta = {
        branchId,
        instanceName: config?.instanceName,
      };

      const remoteJid = config?.instanceName
        ? await this.whatsappService.resolveContactJid(
            config.instanceName,
            key,
            upd,
            config.phoneNumber,
          )
        : this.resolveJidFallback(key, upd);

      if (!remoteJid) continue;

      const originalJid = key?.remoteJid ?? upd?.remoteJid;
      const lidJidForWs =
        originalJid && isLidJid(originalJid)
          ? originalJid
          : isLidJid(remoteJid)
            ? remoteJid
            : undefined;

      const status = this.mapStatus(upd.status ?? upd.update?.status);
      const fromMe = !!key.fromMe;

      await this.whatsappService.updateMessageStatus(messageId, status);

      const syncJids = config?.instanceName
        ? await this.whatsappService.collectSyncJids(
            config.instanceName,
            remoteJid,
            key,
            upd,
            config.phoneNumber,
          )
        : [remoteJid];

      // Lido no celular da loja (mensagem do cliente) → zera não lidas
      if (status === 'read' && !fromMe && config?.id) {
        for (const jid of syncJids) {
          await this.resetUnread(config.id, jid);
        }
        for (const jid of syncJids) {
          this.wsGateway.emitCRMEvent(room, 'crm:chat:update', {
            ...wsMeta,
            remoteJid: jid,
            lidJid: lidJidForWs,
            unreadCount: 0,
          });
        }
      }

      for (const jid of syncJids) {
        this.wsGateway.emitCRMEvent(room, 'crm:message:status', {
          ...wsMeta,
          id: messageId,
          remoteJid: jid,
          lidJid: lidJidForWs,
          status,
          fromMe,
        });
      }
    }
  }

  /** Presença: digitando, gravando, online/offline (Evolution PRESENCE_UPDATE). */
  private async handlePresence(branchId: string, data: any) {
    const items = Array.isArray(data) ? data : [data];
    const room = `branch:${branchId}`;

      const config = await prisma.whatsAppConfig.findUnique({
        where: { branchId },
        select: { instanceName: true, phoneNumber: true },
      });

    for (const item of items) {
      let remoteJid =
        item?.id ||
        item?.remoteJid ||
        item?.participant ||
        (item?.presences ? Object.keys(item.presences)[0] : null);

      if (!remoteJid || isGroupJid(remoteJid)) continue;

      let presence: string =
        item?.presence ||
        item?.lastKnownPresence ||
        item?.status ||
        'unavailable';

      if (item?.presences && typeof item.presences === 'object') {
        const entry =
          item.presences[remoteJid] ?? Object.values(item.presences)[0];
        if (entry && typeof entry === 'object') {
          presence =
            (entry as any).lastKnownPresence ??
            (entry as any).presence ??
            presence;
        }
      }

      const normalized =
        presence === 'composing' || presence === 'recording'
          ? presence
          : presence === 'available'
            ? 'available'
            : 'unavailable';

      const resolved = config?.instanceName
        ? await this.whatsappService.resolveContactJid(
            config.instanceName,
            { remoteJid },
            item,
            config.phoneNumber,
          )
        : remoteJid;

      if (!resolved) continue;

      const syncJids = config?.instanceName
        ? await this.whatsappService.collectSyncJids(
            config.instanceName,
            resolved,
            { remoteJid },
            item,
            config.phoneNumber,
          )
        : [resolved];

      for (const jid of syncJids) {
        this.wsGateway.emitCRMEvent(room, 'crm:presence', {
          remoteJid: jid,
          presence: normalized,
        });
      }
    }
  }

  // ─────────────────────────────────────────────
  // SALVA MENSAGEM (HISTÓRICO COMPLETO)
  // ─────────────────────────────────────────────
  private async upsertMessage(params: any) {
    const {
      id,
      branchId,
      remoteJid,
      fromMe,
      text,
      pushName,
      phone,
      timestampMs,
    } = params;

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
        // evita sobrescrever status ou histórico importante
        text,
        message: text,
        pushName,
      },
    });
  }

  // ─────────────────────────────────────────────
  // LAST MESSAGE (ESSENCIAL DO CHAT)
  // ─────────────────────────────────────────────
  /**
   * Essa tabela controla:
   * - preview do chat
   * - ordenação da lista de conversas
   */
  private async upsertLastMessage(params: any) {
    const {
      branchId,
      remoteJid,
      messageId,
      text,
      timestampMs,
      fromMe,
      pushName,
    } = params;

    const updateData: Record<string, unknown> = {
      messageId,
      text,
      timestamp: BigInt(timestampMs),
      fromMe,
    };
    // Mensagem enviada: não sobrescreve pushName (payload traz nome da loja)
    if (!fromMe && pushName) {
      updateData.pushName = pushName;
    }

    await prisma.chatLastMessage.upsert({
      where: { remoteJid },
      create: {
        branchId,
        remoteJid,
        messageId,
        text,
        timestamp: BigInt(timestampMs),
        fromMe,
        pushName: pushName ?? null,
      },
      update: updateData as {
        messageId: string;
        text: string;
        timestamp: bigint;
        fromMe: boolean;
        pushName?: string | null;
      },
    });
  }

  /**
   * Nome do cliente destino — em mensagens enviadas (fromMe) o pushName do payload é da loja.
   */
  private async resolveContactPushName(
    syncJids: string[],
    fromMe: boolean,
    incomingPushName: string,
    instanceProfileName?: string | null,
    instancePhone?: string | null,
  ): Promise<string> {
    if (!fromMe && incomingPushName && !isInstanceDisplayName(incomingPushName, instanceProfileName, instancePhone)) {
      return incomingPushName;
    }

    for (const jid of syncJids) {
      const row = await prisma.chatLastMessage.findUnique({
        where: { remoteJid: jid },
        select: { pushName: true },
      });
      if (row?.pushName && !isInstanceDisplayName(row.pushName, instanceProfileName, instancePhone)) {
        return row.pushName;
      }
    }

    if (fromMe) return '';

    return incomingPushName && !isInstanceDisplayName(incomingPushName, instanceProfileName, instancePhone)
      ? incomingPushName
      : '';
  }

  // ─────────────────────────────────────────────
  // INCREMENTA NÃO LIDAS
  // ─────────────────────────────────────────────
  /** @param configId ID do WhatsAppConfig (FK de WhatsAppChatRead.branchId) */
  private async incrementUnread(
    configId: string,
    jid: string,
    timestampMs: number,
  ) {
    await prisma.whatsAppChatRead.upsert({
      where: { branchId_jid: { branchId: configId, jid } },
      create: {
        branchId: configId,
        jid,
        unreadCount: 1,
        lastMessageAt: new Date(timestampMs),
      },
      update: {
        unreadCount: { increment: 1 },
        lastMessageAt: new Date(timestampMs),
      },
    });
  }

  // ─────────────────────────────────────────────
  // ZERA NÃO LIDAS (quando usuário lê)
  // ─────────────────────────────────────────────
  /** @param configId ID do WhatsAppConfig (FK de WhatsAppChatRead.branchId) */
  private async resetUnread(configId: string, jid: string) {
    await prisma.whatsAppChatRead.updateMany({
      where: { branchId: configId, jid },
      data: { unreadCount: 0, lastReadAt: new Date() },
    });
  }

  // ─────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────

  /** Fallback síncrono quando não há instância Evolution configurada. */
  private resolveJidFallback(key: any, data: any): string | null {
    const jid =
      data?.remoteJidAlt ||
      data?.senderPn ||
      key?.participant ||
      data?.participant ||
      key?.remoteJid ||
      data?.remoteJid;

    if (!jid) return null;
    if (isGroupJid(jid)) return null;
    if (jid === 'status@broadcast') return null;

    return jid;
  }

  // normaliza timestamp (segundos → ms)
  private toMs(ts: any): number {
    const n = Number(ts);
    if (!n) return Date.now();
    return n < 1e12 ? n * 1000 : n;
  }

  // extrai texto da mensagem (texto, imagem, vídeo etc)
  private extractText(msg: any): string {
    const m = msg?.message ?? msg ?? {};
    return (
      m.conversation ||
      m.extendedTextMessage?.text ||
      m.imageMessage?.caption ||
      m.videoMessage?.caption ||
      ''
    );
  }

  // converte status da Evolution → status interno
  private mapStatus(status?: any): string {
    const s = String(status ?? '').toUpperCase();

    if (typeof status === 'number') {
      const map: any = {
        0: 'error',
        1: 'pending',
        2: 'sent',
        3: 'received',
        4: 'read',
      };
      return map[status] ?? 'sent';
    }

    if (s === 'READ' || s === 'PLAYED') return 'read';
    if (s === 'DELIVERY_ACK' || s === 'DELIVERED' || s === 'RECEIVED') return 'received';
    if (s === 'SERVER_ACK' || s === 'SENT') return 'sent';
    if (s === 'PENDING') return 'pending';
    if (s === 'ERROR') return 'error';

    return 'sent';
  }

  // resolve branch da instância WhatsApp
  private async getUnreadCount(configId: string, jid: string): Promise<number> {
    const row = await prisma.whatsAppChatRead.findUnique({
      where: { branchId_jid: { branchId: configId, jid } },
      select: { unreadCount: true },
    });
    return row?.unreadCount ?? 0;
  }

  private async resolveBranchId(instanceName: string): Promise<string | null> {
    const config = await prisma.whatsAppConfig.findFirst({
      where: { instanceName },
      select: { branchId: true },
    });

    return config?.branchId ?? null;
  }
}