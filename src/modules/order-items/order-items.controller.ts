import { Controller, Patch, Param, Body, Req, UseGuards } from '@nestjs/common';
import { OrderItemsService } from './order-items.service';
import { UpdateOrderItemDto } from './dto/update-order-item.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

@Controller('order-items')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrderItemsController {
  constructor(private readonly orderItemsService: OrderItemsService) {}

  @Patch(':id')
  @Roles('admin', 'manager')
  /** Atualizar status de preparo ou despacho de um item do pedido */
  async update(
    @Param('id') id: string,
    @Body() updateOrderItemDto: UpdateOrderItemDto,
    @Req() req: RequestWithUser,
  ) {
    const orderItem = await this.orderItemsService.update(
      id,
      updateOrderItemDto,
      req.user.userId,
    );
    // Retornar no formato esperado pelo frontend
    return { orderItem };
  }
}
