import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import { prisma } from '../../../lib/prisma';

/**
 * Payload emitido para o destinatário de uma transferência.
 * O front usa esses dados para invalidar cache e exibir toast.
 */
export interface TransferReceivedPayload {
  event: 'transfer:received';
  data: {
    cashSessionId: string;      // ID do caixa que recebeu
    fromUserId: string;          // quem enviou
    fromUserName: string | null;
    amount: number;              // em centavos
    description?: string;
    timestamp: string;           // ISO
  };
}

/**
 * Payload emitido para o remetente confirmando a saída.
 */
export interface TransferSentPayload {
  event: 'transfer:sent';
  data: {
    cashSessionId: string;      // ID do caixa de origem
    toUserId: string;
    toUserName: string | null;
    amount: number;
    description?: string;
    timestamp: string;
  };
}

@WebSocketGateway({
  cors: {
    // Ajuste para a origem do seu frontend em produção
    origin: process.env.FRONTEND_URL ?? '*',
    credentials: true,
  },
  namespace: '/cash',               // ws://host/cash
  transports: ['websocket', 'polling'],
})
export class CashSessionGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(CashSessionGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  // ─── Conexão ────────────────────────────────────────────────────────────────

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.headers.authorization?.replace('Bearer ', '') ?? '');

      if (!token) {
        this.logger.warn(`[WS] Cliente sem token. Desconectando: ${client.id}`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify<{ sub: string }>(token, {
        secret: process.env.JWT_SECRET,
      });

      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, branchId: true },
      });

      if (!user?.branchId) {
        client.disconnect();
        return;
      }

      // Salva metadados no socket para uso posterior
      client.data.userId = user.id;
      client.data.branchId = user.branchId;

      // Entra na room da filial (para broadcasts de branch)
      // e em uma room pessoal (para notificações diretas ao usuário)
      await client.join(`branch:${user.branchId}`);
      await client.join(`user:${user.id}`);

      this.logger.log(
        `[WS] Conectado: userId=${user.id} branchId=${user.branchId} socketId=${client.id}`,
      );
    } catch (err) {
      this.logger.warn(`[WS] Token inválido. Desconectando: ${client.id}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(
      `[WS] Desconectado: userId=${client.data.userId} socketId=${client.id}`,
    );
  }

  // ─── Evento de ping/healthcheck (opcional) ───────────────────────────────────

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    client.emit('pong', { ts: new Date().toISOString() });
  }

  // ─── Emissores públicos chamados pelo Service ────────────────────────────────

  /**
   * Notifica o DESTINATÁRIO da transferência (room pessoal).
   * Chamado após a transação ser gravada no banco.
   */
  notifyTransferReceived(
    toUserId: string,
    payload: TransferReceivedPayload['data'],
  ) {
    this.server.to(`user:${toUserId}`).emit('transfer:received', payload);
    this.logger.log(
      `[WS] transfer:received → user:${toUserId} amount=${payload.amount}`,
    );
  }

  /**
   * Confirma para o REMETENTE que a transferência saiu do caixa.
   * Útil para atualizar o saldo em tempo real sem precisar re-fetch manual.
   */
  notifyTransferSent(
    fromUserId: string,
    payload: TransferSentPayload['data'],
  ) {
    this.server.to(`user:${fromUserId}`).emit('transfer:sent', payload);
    this.logger.log(
      `[WS] transfer:sent → user:${fromUserId} amount=${payload.amount}`,
    );
  }

  /**
   * Broadcast para toda a filial (caixas abertos de todos os operadores).
   * Pode ser usado para sincronizar dashboards de supervisores.
   */
  broadcastToRoom(branchId: string, event: string, data: unknown) {
    this.server.to(`branch:${branchId}`).emit(event, data);
  }
}