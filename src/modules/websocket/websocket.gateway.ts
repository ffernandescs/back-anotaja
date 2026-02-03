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
import { prisma } from '../../../lib/prisma';
import { RedisService, LocationUpdate } from './redis.service';

interface AuthenticatedSocket extends Socket {
  user?: {
    userId: string;
    email?: string;
    role?: string;
    branchId?: string;
    deliveryPersonId?: string;
  };
}

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
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
    private redisService: RedisService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    this.logger.log(`🔌 Nova conexão WebSocket: ${client.id}`);
    this.logger.log(`🔌 Namespace: ${client.nsp.name}`);
    this.logger.log(`🔌 Path: ${client.handshake.url}`);

    try {
      const token: string | undefined =
        typeof client.handshake.auth?.token === 'string'
          ? client.handshake.auth.token
          : typeof client.handshake.headers?.authorization === 'string'
            ? client.handshake.headers.authorization.replace('Bearer ', '')
            : undefined;

      // 🔹 Permitir modo público para rastrear pedido (sem token) usando query orderId
      if (!token) {
        const orderId = (client.handshake.query?.orderId as string | undefined)?.trim();
        if (orderId) {
          const orderExists = await prisma.order.findUnique({ where: { id: orderId } });
          if (!orderExists) {
            this.logger.warn(
              `WebSocket public tracking rejected: Order not found (${orderId})`,
            );
            client.disconnect();
            return;
          }

          const orderRoom = `order:${orderId}`;
          client.join(orderRoom);
          this.logger.log(
            `✅ Public tracking connected without token, joined room: ${orderRoom}`,
          );
          void client.emit('connected', { orderId, role: 'guest' });
          return;
        }

        this.logger.warn('WebSocket connection rejected: No token provided');
        client.disconnect();
        return;
      }

      let payload: JwtPayload;
      const primarySecret = this.configService.get<string>('JWT_SECRET');
      const storeSecret = this.configService.get<string>('STORE_JWT_SECRET');

      try {
        payload = this.jwtService.verify(token, { secret: primarySecret });
      } catch (err) {
        // Fallback para token da loja (store_token) em ambiente multi-tenant
        if (storeSecret) {
          payload = this.jwtService.verify(token, { secret: storeSecret });
        } else {
          throw err;
        }
      }

      const deliveryPersonId = payload.deliveryPersonId as string | undefined;
      const userId = payload.sub || payload.userId;

      if (deliveryPersonId) {
        const deliveryPerson = await prisma.deliveryPerson.findUnique({
          where: { id: deliveryPersonId },
          include: { branch: true },
        });

        if (!deliveryPerson) {
          this.logger.warn(
            `WebSocket connection rejected: Delivery person not found (${deliveryPersonId})`,
          );
          client.disconnect();
          return;
        }

        client.user = {
          userId: deliveryPerson.id,
          role: 'delivery',
          branchId: deliveryPerson.branchId,
          deliveryPersonId: deliveryPerson.id,
        };

        if (deliveryPerson.branchId) {
          const branchRoom = `branch:${deliveryPerson.branchId}`;
          client.join(branchRoom);
          this.logger.log(
            `✅ Delivery ${deliveryPerson.id} connected and joined room: ${branchRoom}`,
          );
        }

        const deliveryRoom = `delivery:${deliveryPerson.id}`;
        client.join(deliveryRoom);

        void client.emit('connected', {
          deliveryPersonId: deliveryPerson.id,
          branchId: deliveryPerson.branchId,
          role: 'delivery',
        });
      } else if (userId) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          include: { branch: true },
        });

        if (!user) {
          // Fallback para tokens da loja que não têm usuário no banco, mas trazem branchId no payload
          if (payload.branchId) {
            client.user = {
              userId: userId,
              role: payload.role || 'customer',
              branchId: payload.branchId,
            } as any;

            const branchRoom = `branch:${payload.branchId}`;
            client.join(branchRoom);
            this.logger.log(
              `✅ Store token without DB user joined room: ${branchRoom}`,
            );

            void client.emit('connected', {
              userId,
              branchId: payload.branchId,
              role: payload.role || 'customer',
            });
            return;
          }

          this.logger.warn(
            `WebSocket connection rejected: User not found (${userId}) and no branchId in token`,
          );
          client.disconnect();
          return;
        }

        client.user = {
          userId: user.id,
          email: user.email || undefined,
          role: user.role,
          branchId: user.branchId || undefined,
        };

        if (user.branchId) {
          const branchRoom = `branch:${user.branchId}`;
          client.join(branchRoom);
          this.logger.log(
            `✅ User ${user.id} connected and joined room: ${branchRoom}`,
          );
        }

        const userRoom = `user:${user.id}`;
        client.join(userRoom);
        this.logger.log(`✅ User ${user.id} joined personal room: ${userRoom}`);

        void client.emit('connected', {
          userId: user.id,
          branchId: user.branchId,
          role: user.role,
        });
      } else {
        this.logger.warn(
          'WebSocket connection rejected: No userId or deliveryPersonId found in token',
        );
        client.disconnect();
        return;
      }
    } catch (error) {
      this.logger.error('WebSocket authentication error:', error);
      client.disconnect();
    }
  }

  /**
   * Emitir evento de rota de entrega para app do entregador e filial
   */
  emitDeliveryRouteUpdate(
    payload: {
      event: 'route:created' | 'route:updated' | 'route:deleted' | 'route:assigned';
      assignment: any;
      branchId: string;
      deliveryPersonId?: string | null;
    },
  ) {
    if (!this.server || !this.server.sockets) {
      this.logger.warn('WebSocket server not initialized, cannot emit delivery route');
      return;
    }

    const { branchId, deliveryPersonId } = payload;

    // Enviar para filial (para dashboards/admin acompanhar)
    if (branchId) {
      const branchRoom = `branch:${branchId}`;
      this.server.to(branchRoom).emit('delivery:route:update', payload);
      this.logger.debug(`📤 Emitted delivery:route:update to branch room ${branchRoom}`);
    }

    // Enviar direto para o entregador se houver
    if (deliveryPersonId) {
      const deliveryRoom = `delivery:${deliveryPersonId}`;
      this.server.to(deliveryRoom).emit('delivery:route:update', payload);
      // Compatibilidade com room de usuário caso existam listeners antigos
      const userRoom = `user:${deliveryPersonId}`;
      this.server.to(userRoom).emit('delivery:route:update', payload);
      this.logger.log(
        `📤 Emitted delivery:route:update to delivery rooms delivery:${deliveryPersonId} / user:${deliveryPersonId}`,
      );
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    if (client.user?.deliveryPersonId) {
      await prisma.deliveryPerson.update({
        where: { id: client.user.deliveryPersonId },
        data: { isOnline: false, lastOnlineAt: null },
      });
      this.logger.log(
        `❌ Delivery ${client.user.deliveryPersonId} disconnected (offline)`,
      );
      return;
    }

    if (client.user) {
      this.logger.log(`❌ User ${client.user.userId} disconnected`);
    }
  }

  @SubscribeMessage('delivery:online')
  async handleDeliveryOnline(
    client: AuthenticatedSocket,
    payload?: { deliveryPersonId?: string },
  ) {
    const deliveryPersonId =
      client.user?.deliveryPersonId || payload?.deliveryPersonId;
    if (!deliveryPersonId) {
      client.emit('error', { message: 'Delivery person not authenticated' });
      return;
    }

    const deliveryPerson = await prisma.deliveryPerson.update({
      where: { id: deliveryPersonId },
      data: { isOnline: true, lastOnlineAt: new Date() },
    });

    client.emit('delivery:status', {
      deliveryPersonId,
      isOnline: deliveryPerson.isOnline,
    });
  }

  @SubscribeMessage('delivery:offline')
  async handleDeliveryOffline(
    client: AuthenticatedSocket,
    payload?: { deliveryPersonId?: string },
  ) {
    const deliveryPersonId =
      client.user?.deliveryPersonId || payload?.deliveryPersonId;
    if (!deliveryPersonId) {
      client.emit('error', { message: 'Delivery person not authenticated' });
      return;
    }

    const deliveryPerson = await prisma.deliveryPerson.update({
      where: { id: deliveryPersonId },
      data: { isOnline: false, lastOnlineAt: null },
    });

    client.emit('delivery:status', {
      deliveryPersonId,
      isOnline: deliveryPerson.isOnline,
    });
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
   * Emitir evento de novo pedido criado
   */
  emitNewOrder(
    branchId: string,
    order: {
      id: string;
      orderNumber?: number | null;
      status: string;
      deliveryType: string;
      customer: {
        name: string;
        phone: string;
      };
      total: number;
      createdAt: string;
      [key: string]: any;
    },
  ) {
    if (!this.server || !this.server.sockets) {
      this.logger.warn(
        'WebSocket server not initialized, cannot emit new order',
      );
      return;
    }

    const branchRoom = `branch:${branchId}`;
    const eventData = {
      event: 'order:created',
      order,
    };

    // Contar clientes no room
    let clientCount = 0;
    try {
      if (this.server.sockets.adapter?.rooms) {
        const clientsInRoom = this.server.sockets.adapter.rooms.get(branchRoom);
        clientCount = clientsInRoom ? clientsInRoom.size : 0;
      }
    } catch (error) {
      this.logger.debug('Could not count clients in room:', error);
    }

    // Emitir para todos os clientes da filial
    this.server.to(branchRoom).emit('order:new', eventData);
    this.server.to(branchRoom).emit('order:update', eventData);

    this.logger.log(
      `📤 New order created - Emitted to room ${branchRoom}: Order #${order.orderNumber || order.id.slice(0, 8)}${clientCount > 0 ? ` (${clientCount} clients listening)` : ' (no clients listening)'}`,
    );

    // Emitir também para o room específico do pedido
    const orderRoom = `order:${order.id}`;
    this.server.to(orderRoom).emit('order:new', eventData);
    this.logger.debug(`📤 Emitted order:new to order room ${orderRoom}`);
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

    if (order.branchId) {
      const branchRoom = `branch:${order.branchId}`;

      if (!this.server || !this.server.sockets) {
        this.logger.warn(
          'WebSocket server not initialized, cannot emit order:update',
        );
        return;
      }

      let clientCount = 0;
      try {
        if (this.server.sockets.adapter?.rooms) {
          const clientsInRoom =
            this.server.sockets.adapter.rooms.get(branchRoom);
          clientCount = clientsInRoom ? clientsInRoom.size : 0;
        }
      } catch (error) {
        this.logger.debug('Could not count clients in room:', error);
      }

      this.server.to(branchRoom).emit('order:update', eventData);
      this.logger.log(
        `📤 Emitted order:update to room ${branchRoom}: ${eventType} - Order ${order.id}${clientCount > 0 ? ` (${clientCount} clients listening)` : ''}`,
      );
    }

    if (order.deliveryPersonId) {
      const deliveryPersonRoom = `user:${order.deliveryPersonId}`;
      this.server.to(deliveryPersonRoom).emit('order:update', eventData);
      this.logger.debug(
        `📤 Emitted order:update to delivery person room ${deliveryPersonRoom}`,
      );
    }

    if (order.id) {
      const orderRoom = `order:${order.id}`;
      this.server.to(orderRoom).emit('order:update', eventData);
      this.logger.debug(`📤 Emitted order:update to order room ${orderRoom}`);
    }
  }

  /**
   * Emitir notificação genérica para uma filial
   */
  emitBranchNotification(
    branchId: string,
    notification: {
      type: string;
      title: string;
      message: string;
      data?: any;
    },
  ) {
    if (!this.server || !this.server.sockets) {
      this.logger.warn(
        'WebSocket server not initialized, cannot emit notification',
      );
      return;
    }

    const branchRoom = `branch:${branchId}`;
    this.server.to(branchRoom).emit('notification', notification);
    this.logger.log(
      `📤 Notification sent to branch ${branchId}: ${notification.title}`,
    );
  }

  /**
   * Emitir notificação para um usuário específico
   */
  emitUserNotification(
    userId: string,
    notification: {
      type: string;
      title: string;
      message: string;
      data?: any;
    },
  ) {
    if (!this.server || !this.server.sockets) {
      this.logger.warn(
        'WebSocket server not initialized, cannot emit notification',
      );
      return;
    }

    const userRoom = `user:${userId}`;
    this.server.to(userRoom).emit('notification', notification);
    this.logger.log(
      `📤 Notification sent to user ${userId}: ${notification.title}`,
    );
  }

  @SubscribeMessage('location:update')
  async handleLocationUpdate(
    client: AuthenticatedSocket,
    payload: {
      rotaId: string;
      coordinates: { lat: number; lng: number };
      heading?: number;
      speed?: number;
      accuracy?: number;
    },
  ) {
    const deliveryPersonId = client.user?.deliveryPersonId;
    
    if (!deliveryPersonId) {
      client.emit('error', { message: 'Delivery person not authenticated' });
      return;
    }

    const locationUpdate: LocationUpdate = {
      type: 'location_update',
      entregadorId: deliveryPersonId,
      rotaId: payload.rotaId,
      coordinates: payload.coordinates,
      heading: payload.heading,
      speed: payload.speed,
      accuracy: payload.accuracy,
      timestamp: new Date().toISOString(),
    };

    await this.redisService.cacheLastLocation(deliveryPersonId, locationUpdate);
    await this.redisService.appendToRouteTrail(payload.rotaId, payload.coordinates);
    const trail = await this.redisService.getRouteTrail(payload.rotaId);

    // Incluir trilha no payload para evitar linhas retas na visualização
    const broadcastPayload = { ...locationUpdate, trail };

    await this.redisService.publishLocationUpdate(payload.rotaId, broadcastPayload);

    const rotaRoom = `rota:${payload.rotaId}`;
    this.server.to(rotaRoom).emit('location:update', broadcastPayload);

    this.logger.debug(
      `📍 Location update from ${deliveryPersonId} for rota ${payload.rotaId}`,
    );
  }

  @SubscribeMessage('location:subscribe')
  async handleLocationSubscribe(
    client: AuthenticatedSocket,
    payload: { rotaId: string },
  ) {
    if (!client.user) {
      client.emit('error', { message: 'Not authenticated' });
      return;
    }

    const rotaRoom = `rota:${payload.rotaId}`;
    client.join(rotaRoom);
    
    this.logger.log(
      `✅ User ${client.user.userId} subscribed to location updates for rota ${payload.rotaId}`,
    );

    const rota = await prisma.deliveryAssignment.findUnique({
      where: { id: payload.rotaId },
      include: { deliveryPerson: true },
    });

    if (!rota) {
      client.emit('error', { message: 'Rota not found' });
      return;
    }

    const lastLocation = await this.redisService.getLastLocation(rota.deliveryPersonId);
    const trail = await this.redisService.getRouteTrail(payload.rotaId);

    client.emit('location:initial', {
      rotaId: payload.rotaId,
      lastLocation,
      trail,
      rota: {
        id: rota.id,
        name: rota.name,
        status: rota.status,
        deliveryPerson: {
          id: rota.deliveryPerson.id,
          name: rota.deliveryPerson.name,
        },
      },
    });
  }

  @SubscribeMessage('location:unsubscribe')
  handleLocationUnsubscribe(
    client: AuthenticatedSocket,
    payload: { rotaId: string },
  ) {
    const rotaRoom = `rota:${payload.rotaId}`;
    client.leave(rotaRoom);
    
    this.logger.log(
      `🔕 User ${client.user?.userId} unsubscribed from rota ${payload.rotaId}`,
    );
  }

  @SubscribeMessage('heartbeat')
  async handleHeartbeat(client: AuthenticatedSocket) {
    const deliveryPersonId = client.user?.deliveryPersonId;
    
    if (deliveryPersonId) {
      await this.redisService.setEntregadorOnlineStatus(deliveryPersonId, true);
    }
    
    client.emit('heartbeat:ack', { timestamp: new Date().toISOString() });
  }
}
