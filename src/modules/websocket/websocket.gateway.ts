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
    groupId?: string;
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
  ) {
    console.log('🖨️ WebSocketGateway constructor initialized');
  }

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
          void client.emit('connected', { orderId });
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
              group: payload.group ,
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
              group: payload.group,
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
          groupId: user.groupId || undefined,
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
          groupId: user.groupId,
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
  async emitOrderUpdate(
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

    // 🖨️ Imprimir pedido automaticamente quando criado
    if (eventType === 'order:created') {
      console.log('🖨️ WebSocketGateway - Attempting to print order:', order.orderNumber);
      console.log('🖨️ WebSocketGateway - Full order object received:', JSON.stringify(order, null, 2));
      
      try {
        // Formatar dados para impressão
        const orderData = {
          number: String(order.orderNumber || '0000').padStart(4, '0'),
          table: order.tableNumber || (order.deliveryType === 'DELIVERY' ? 'Entrega' : order.deliveryType === 'TAKEOUT' ? 'Retirada' : undefined),
          deliveryType: order.deliveryType || 'PICKUP',
          payment: this.getPaymentMethodText(order),
          discount: Number(order.discount || 0) / 100, // converter de centavos para reais
          deliveryFee: Number(order.deliveryFee || 0) / 100, // converter de centavos para reais
          serviceFee: Number(order.serviceFee || 0) / 100, // converter de centavos para reais
          notes: order.notes || undefined,
          store: {
            name: 'Estabelecimento', // será sobrescrito abaixo
            cnpj: '',
            address: '',
          },
          customer: order.customer ? {
            name: order.customer.name,
            phone: this.formatPhone(order.customer.phone || order.customerPhone || ''),
          } : undefined,
          deliveryAddress: order.deliveryAddress,
          pickupTime: order.pickupTime,
          items: order.items?.map((item: any) => ({
            name: item.product?.name || 'Item desconhecido',
            qty: item.quantity,
            price: Number(item.price) / 100, // converter de centavos para reais
          })) || [],
        };

        // Buscar dados completos da branch
        const branch = await prisma.branch.findUnique({
          where: { id: order.branchId },
          include: { company: true },
        });

        // Buscar dados completos do cliente se for delivery
        let customerData: any = null;
        let addressData: any = null;
        
        console.log('🖨️ WebSocketGateway - Order data:', {
          deliveryType: order.deliveryType,
          customerId: order.customerId,
          customerAddressId: order.customerAddressId,
          customerPhone: order.customerPhone
        });
        
        if (order.deliveryType === 'DELIVERY' && order.customerId) {
          customerData = await prisma.customer.findUnique({
            where: { id: order.customerId },
          });
          console.log('🖨️ WebSocketGateway - Customer data:', customerData);
        }

        // Buscar endereço se for delivery
        if (order.deliveryType === 'DELIVERY' && order.customerAddressId) {
          addressData = await prisma.customerAddress.findUnique({
            where: { id: order.customerAddressId },
          });
          console.log('🖨️ WebSocketGateway - Address data:', addressData);
        }

        if (branch) {
          orderData.store.name = branch.branchName || 'Estabelecimento';
          orderData.store.cnpj = branch.company?.document || '';
          orderData.store.address = branch.branchName || ''; // usar branchName como address por temporarily
          
          // Adicionar dados do cliente
          if (customerData) {
            // Formatar telefone com máscara
            const formattedPhone = this.formatPhone(customerData.phone || order.customerPhone || '');
            
            orderData.customer = {
              name: customerData.name || 'Cliente',
              phone: formattedPhone,
            };
          }
          
          // Adicionar endereço de entrega completo
          if (addressData) {
            const addressParts = [
              addressData.street,
              addressData.number || 'S/N',
              addressData.complement,
              addressData.neighborhood,
              addressData.zipCode, // campo correto é zipCode
              addressData.city,
              addressData.state
            ].filter(Boolean);
            
            orderData.deliveryAddress = addressParts.join(', ');
            // Adicionar taxa de entrega padrão se não tiver
            if (!orderData.deliveryFee) {
              orderData.deliveryFee = 5.00; // taxa padrão
            }
            console.log('🖨️ WebSocketGateway - Address added to orderData:', orderData.deliveryAddress);
          } else {
            console.log('🖨️ WebSocketGateway - No address data found, using fallback');
            // Adicionar endereço genérico se não encontrar
            orderData.deliveryAddress = 'Endereço não informado';
          }
          
          console.log('🖨️ WebSocketGateway - Complete data assembled, sending to printer');
          
          // Enviar diretamente para API da impressora
          const payload = {
            order: orderData,
            copies: 1,
          };

          const response = await fetch('http://localhost:3131/print', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          });

          if (response.ok) {
            const result = await response.json();
            console.log('🖨️ WebSocketGateway - Print sent successfully:', result);
          } else {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            console.error('🖨️ WebSocketGateway - Printer API error:', error);
          }
        } else {
          console.log('🖨️ WebSocketGateway - Branch not found');
        }
      } catch (error) {
        console.error('🖨️ WebSocketGateway - Print error:', error instanceof Error ? error.message : String(error));
      }
    }
  }

  private getPaymentMethodText(order: any): string {
    const payments = order.payments || [];
    if (payments.length === 0) return 'Não informado';

    if (payments.length === 1) {
      const payment = payments[0];
      const value = String(payment.type || payment.paymentMethod || '').toLowerCase();
      
      if (['pix'].includes(value)) return 'PIX';
      if (['dinheiro', 'cash'].includes(value)) return 'Dinheiro';
      if (['credito', 'crédito', 'credit', 'credit_card', 'cartão de crédito', 'cartao de credito'].includes(value))
        return 'Cartão Crédito';
      if (['debito', 'débito', 'debit', 'debit_card', 'cartão de débito', 'cartao de debito'].includes(value))
        return 'Cartão Débito';
      
      return 'Outros';
    }

    return 'Múltiplos';
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

  // ─── CRM Events (WhatsApp) ──────────────────────────────────────

  /**
   * Emit CRM event to a specific branch room.
   * Used by the WhatsApp webhook controller to push real-time events.
   */
  emitCRMEvent(room: string, event: string, data: any) {
    if (!this.server || !this.server.sockets) {
      this.logger.warn('WebSocket server not initialized, cannot emit CRM event');
      return;
    }

    this.server.to(room).emit(event, data);
    this.logger.debug(`📤 CRM event ${event} → ${room}`);
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

  // ─── WhatsApp CRM: Send Message ───────────────────────────────────

  @SubscribeMessage('crm:message:send')
  async handleCRMMessageSend(
    client: AuthenticatedSocket,
    payload: { jid: string; text: string },
  ) {
    if (!client.user?.branchId) {
      client.emit('error', { message: 'Not authenticated or no branchId' });
      return;
    }

    try {
      const { WhatsAppService } = await import('../whatsapp/whatsapp.service');
      const whatsappService = new WhatsAppService();

      const result = await whatsappService.sendCrmMessage(
        client.user.branchId,
        payload,
      );

      // Emit confirmation back to sender
      client.emit('crm:message:sent', {
        messageId: result.messageId,
        jid: payload.jid,
        text: payload.text,
        status: 'sent',
      });

      // Also broadcast to branch room for other users
      this.emitCRMEvent(`branch:${client.user.branchId}`, 'crm:message', {
        id: result.messageId,
        remoteJid: payload.jid,
        fromMe: true,
        text: payload.text,
        timestamp: Math.floor(Date.now() / 1000),
        status: 'sent',
        mediaType: 'text',
      });
    } catch (error) {
      this.logger.error('Error sending CRM message via WebSocket:', error);
      client.emit('crm:message:error', {
        jid: payload.jid,
        error: error instanceof Error ? error.message : 'Failed to send message',
      });
    }
  }

  /**
   * Formatar telefone com máscara brasileira
   */
  private formatPhone(phone: string): string {
    if (!phone) return '';
    
    // Remover todos os caracteres não numéricos
    const numbersOnly = phone.replace(/\D/g, '');
    
    // Verificar se é um número válido de celular ou fixo
    if (numbersOnly.length >= 10 && numbersOnly.length <= 11) {
      // Formatar: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
      const ddd = numbersOnly.substring(0, 2);
      const firstPart = numbersOnly.substring(2, numbersOnly.length === 11 ? 7 : 6);
      const secondPart = numbersOnly.substring(numbersOnly.length === 11 ? 7 : 6);
      
      return `(${ddd}) ${firstPart}-${secondPart}`;
    }
    
    // Se não for um formato padrão, retornar o original
    return phone;
  }
}
