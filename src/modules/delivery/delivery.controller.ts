import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { DeliveryService } from './delivery.service';
import { DeliveryHeartbeatDto } from './dto/delivery-heartbeat.dto';
import { DeliveryLoginDto } from './dto/delivery-login.dto';

@Controller('delivery')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

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
  ) {
    const token = authorization?.replace('Bearer ', '').trim();
    return this.deliveryService.getOrders(token, status);
  }

  @Public()
  @Get('assignments')
  listAssignments(@Headers('authorization') authorization?: string) {
    const token = authorization?.replace('Bearer ', '').trim();
    return this.deliveryService.getAssignments(token);
  }
}
