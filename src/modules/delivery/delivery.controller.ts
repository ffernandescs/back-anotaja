import { Controller, Get, Post, Body, Param, Headers, Query, Req } from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { Public } from '../../common/decorators/public.decorator';
import { DeliveryLoginDto } from './dto/delivery-login.dto';
import { DeliveryHeartbeatDto } from './dto/delivery-heartbeat.dto';
import { OrderStatusDto } from '../orders/dto/create-order-item.dto';
import { Request } from 'express';

@Controller('delivery')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  private extractDeliveryToken(req: Request, authorization?: string): string | undefined {
    const headerToken = (req.headers['delivery_token'] as string | undefined)?.trim();
    const cookieToken = (req.cookies?.delivery_token as string | undefined)?.trim();
    const bearer = authorization?.replace('Bearer ', '').trim();
    // Priorizar delivery_token explícito; se não houver, usar Bearer
    return headerToken || cookieToken || bearer;
  }

  @Public()
  @Post('login')
  login(@Body() dto: DeliveryLoginDto) {
    return this.deliveryService.login(dto);
  }

  @Public()
  @Get('me')
  me(@Headers('authorization') authorization?: string) {
    const token = authorization?.replace('Bearer ', '').trim();
    return this.deliveryService.me(token);
  }

  @Public()
  @Post('heartbeat')
  heartbeat(@Body() dto: DeliveryHeartbeatDto) {
    return this.deliveryService.heartbeat(dto.deliveryPersonId);
  }

  @Public()
  @Post('offline')
  setOffline(@Body() dto: DeliveryHeartbeatDto) {
    return this.deliveryService.setOffline(dto.deliveryPersonId);
  }

  // ✅ Rotas dedicadas para entregador autenticado pelo token de entrega
  @Public()
  @Get('orders')
  listOrders(
    @Headers('authorization') authorization?: string,
    @Query('status') status?: string,
    @Req() req?: Request,
  ) {
    const token = this.extractDeliveryToken(req as Request, authorization);
    return this.deliveryService.getOrders(token, status);
  }

  @Public()
  @Get('assignments')
  listAssignments(@Headers('authorization') authorization?: string, @Req() req?: Request) {
    const token = this.extractDeliveryToken(req as Request, authorization);
    return this.deliveryService.getAssignments(token);
  }

  // ✅ Atualização de status usando token do entregador (sem JWT padrão)
  @Public()
  @Post('orders/:id/status')
  updateOrderStatus(
    @Param('id') orderId: string,
    @Body('status') status: OrderStatusDto,
    @Headers('authorization') authorization?: string,
    @Req() req?: Request,
  ) {
    const token = this.extractDeliveryToken(req as Request, authorization);
    return this.deliveryService.updateOrderStatus(token, orderId, status);
  }

  // ✅ Despacho em lote (somente se todos os pedidos estiverem READY)
  @Public()
  @Post('orders/dispatch')
  dispatchOrder(
    @Body('orderId') orderId: string,
    @Headers('authorization') authorization?: string,
    @Req() req?: Request,
  ) {
    const token = this.extractDeliveryToken(req as Request, authorization);
    return this.deliveryService.dispatchOrder(token, orderId);
  }

   @Public()
  @Post('orders/dispatch-bulk')
  dispatchOrders(
    @Body('orderIds') orderIds: string[],
    @Headers('authorization') authorization?: string,
    @Req() req?: Request,
  ) {
    const token = this.extractDeliveryToken(req as Request, authorization);
    return this.deliveryService.dispatchOrdersBulk(token, orderIds);
  }

  // ✅ Conclusão individual (DELIVERING -> DELIVERED)
  @Public()
  @Post('orders/complete')
  completeOrder(
    @Body('orderId') orderId: string,
    @Headers('authorization') authorization?: string,
    @Req() req?: Request,
  ) {
    const token = this.extractDeliveryToken(req as Request, authorization);
    return this.deliveryService.completeOrder(token, orderId);
  }

  // ✅ Conclusão em lote (somente pedidos em DELIVERING)
  @Public()
  @Post('orders/complete-bulk')
  completeOrders(
    @Body('orderIds') orderIds: string[],
    @Headers('authorization') authorization?: string,
    @Req() req?: Request,
  ) {
    const token = this.extractDeliveryToken(req as Request, authorization);
    return this.deliveryService.completeOrdersBulk(token, orderIds);
  }


  // ✅ Marcar onboarding do entregador como concluído
  @Public()
  @Post('onboarding/complete')
  completeOnboarding(@Headers('authorization') authorization?: string, @Req() req?: Request) {
    const token = this.extractDeliveryToken(req as Request, authorization);
    return this.deliveryService.completeOnboarding(token);
  }
}
