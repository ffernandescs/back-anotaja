import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from './types';
import { prisma } from 'lib/prisma';

interface AuthenticatedSocket extends Socket {
  user?: {
    userId: string;
    email?: string;
    role?: string;
    branchId?: string;
  };
}

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
  // Não especificar namespace usa o padrão '/' automaticamente
  path: '/socket.io',
})
export class OrdersWebSocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(OrdersWebSocketGateway.name);

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    this.logger.log(`🔌 Nova conexão WebSocket: ${client.id}`);
    this.logger.log(`🔌 Namespace: ${client.nsp.name}`);
    this.logger.log(`🔌 Path: ${client.handshake.url}`);

    try {
      // Autenticação via token no handshake
      const token: string | undefined =
        typeof client.handshake.auth?.token === 'string'
          ? client.handshake.auth.token
          : typeof client.handshake.headers?.authorization === 'string'
            ? client.handshake.headers.authorization.replace('Bearer ', '')
            : undefined;

      if (!token) {
        this.logger.warn('WebSocket connection rejected: No token provided');
        client.disconnect();
        return;
      }

      // Verificar e decodificar token
      const payload: JwtPayload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      // Usar sub ou userId (compatibilidade com tokens de store e admin)
      const userId = payload.sub || payload.userId;
      if (!userId) {
        this.logger.warn(
          'WebSocket connection rejected: No userId found in token',
        );
        client.disconnect();
        return;
      }

      // Buscar usuário no banco para obter branchId
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { branch: true },
      });

      if (!user) {
        this.logger.warn(
          `WebSocket connection rejected: User not found (${userId})`,
        );
        client.disconnect();
        return;
      }

      // Adicionar informações do usuário ao socket
      client.user = {
        userId: user.id,
        email: user.email || undefined,
        role: user.role,
        branchId: user.branchId || undefined,
      };

      // Entrar em rooms baseado no branchId
      if (user.branchId) {
        const branchRoom = `branch:${user.branchId}`;
        client.join(branchRoom);
        this.logger.log(
          `✅ User ${user.id} connected and joined room: ${branchRoom}`,
        );
      }

      // Room específico do usuário
      const userRoom = `user:${user.id}`;
      client.join(userRoom);
      this.logger.log(`✅ User ${user.id} joined personal room: ${userRoom}`);

      // Emitir confirmação de conexão
      void client.emit('connected', {
        userId: user.id,
        branchId: user.branchId,
        role: user.role,
      });
    } catch (error) {
      this.logger.error('WebSocket authentication error:', error);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.user) {
      this.logger.log(`❌ User ${client.user.userId} disconnected`);
    }
  }

  @SubscribeMessage('join')
  handleJoin(client: AuthenticatedSocket, room: string) {
    if (!client.user) {
      client.emit('error', { message: 'Not authenticated' });
      return;
    }

    client.join(room);
    this.logger.log(
      `✅ User ${client.user.userId} joined room via emit: ${room}`,
    );
    void client.emit('joined', { room });
  }

  /**
   * Emitir evento de atualização de pedido
   */
  emitOrderUpdate(
    order: {
      id: string;
      status?: string;
      branchId: string;
      deliveryPersonId?: string | null;
      tableId?: string | null;
      [key: string]: any;
    },
    eventType:
      | 'order:created'
      | 'order:updated'
      | 'order:deleted'
      | 'order:status_changed' = 'order:updated',
  ) {
    const eventData = {
      event: eventType,
      order,
    };

    // Emitir para a filial (PRINCIPAL - todos os admins conectados)
    if (order.branchId) {
      const branchRoom = `branch:${order.branchId}`;

      // Verificar se server está inicializado
      if (!this.server || !this.server.sockets) {
        this.logger.warn(
          'WebSocket server not initialized, cannot emit order:update',
        );
        return;
      }

      // Tentar contar clientes no room (pode não estar disponível em todas as versões)
      let clientCount = 0;
      try {
        if (this.server.sockets.adapter?.rooms) {
          const clientsInRoom =
            this.server.sockets.adapter.rooms.get(branchRoom);
          clientCount = clientsInRoom ? clientsInRoom.size : 0;
        }
      } catch (error) {
        // Ignorar erro ao contar clientes, não é crítico
        this.logger.debug('Could not count clients in room:', error);
      }

      this.server.to(branchRoom).emit('order:update', eventData);
      this.logger.log(
        `📤 Emitted order:update to room ${branchRoom}: ${eventType} - Order ${order.id}${clientCount > 0 ? ` (${clientCount} clients listening)` : ''}`,
      );
    }

    // Emitir para o entregador se houver
    if (order.deliveryPersonId) {
      const deliveryPersonRoom = `user:${order.deliveryPersonId}`;
      this.server.to(deliveryPersonRoom).emit('order:update', eventData);
      this.logger.debug(
        `📤 Emitted order:update to delivery person room ${deliveryPersonRoom}`,
      );
    }

    // Emitir para o room específico do pedido
    if (order.id) {
      const orderRoom = `order:${order.id}`;
      this.server.to(orderRoom).emit('order:update', eventData);
      this.logger.debug(`📤 Emitted order:update to order room ${orderRoom}`);
    }
  }
}
