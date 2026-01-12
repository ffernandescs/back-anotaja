import { ForbiddenException, Injectable } from '@nestjs/common';
import { prisma } from 'lib/prisma';
import { OrdersWebSocketGateway } from '../websocket/websocket.gateway';
import { UpdateOrderItemDto } from './dto/update-order-item.dto';

@Injectable()
export class OrderItemsService {
  constructor(private webSocketGateway: OrdersWebSocketGateway) {}

  async update(
    id: string,
    updateOrderItemDto: UpdateOrderItemDto,
    userId: string,
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new ForbiddenException('Usuário não encontrado');
    }
    const orderItem = await prisma.orderItem.findUnique({
      where: { id },
    });
    return orderItem;
  }
}
