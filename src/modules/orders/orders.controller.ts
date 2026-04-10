import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { OrderStatusDto } from './dto/create-order-item.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrdersService } from './orders.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Roles('admin', 'manager', 'customer')
  /** Criar novo pedido */
  create(@Body() createOrderDto: CreateOrderDto, @Req() req: RequestWithUser) {
    return this.ordersService.create(createOrderDto, req.user.userId);
  }

  @Get()
  findAll(@Req() req: RequestWithUser, @Query() query: QueryOrdersDto) {
    return this.ordersService.findAll(req.user.userId, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.ordersService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  @Roles('admin', 'manager', 'delivery')
  update(
    @Param('id') id: string,
    @Body() updateOrderDto: UpdateOrderDto,
    @Req() req: RequestWithUser,
  ) {
    return this.ordersService.update(id, updateOrderDto, req.user.userId);
  }

  @Put(':id')
  @Roles('admin', 'manager', 'delivery')
  updatePut(
    @Param('id') id: string,
    @Body() updateOrderDto: UpdateOrderDto,
    @Req() req: RequestWithUser,
  ) {
    return this.ordersService.update(id, updateOrderDto, req.user.userId);
  }

  @Patch(':id/status')
  
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: OrderStatusDto,
    @Req() req: RequestWithUser,
  ) {
    return this.ordersService.updateStatus(id, status, req.user.userId);
  }

  @Patch(':id/status/delivery')
  @Roles('admin', 'manager', 'delivery')
  updateStatusByDelivery(
    @Param('id') id: string,
    @Body('status') status: OrderStatusDto,
    @Req() req: RequestWithUser,
  ) {
    return this.ordersService.updateStatus(id, status, req.user.userId);
  }

  @Delete(':id')
  
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.ordersService.remove(id, req.user.userId);
  }

  @Post(':orderId/payment')
  async addPayment(
    @Param('orderId') orderId: string,
    @Body() dto: CreatePaymentDto,
    @Req() req: RequestWithUser,
  ) {
    const userId = req.user.userId;
    return this.ordersService.addPayment(orderId, dto, userId);
  }

  @Patch(':orderId/mark-paid')
  async markAsPaid(@Param('orderId') orderId: string, @Req() req: RequestWithUser) {
    const userId = req.user.userId;
    return this.ordersService.markOrderAsPaid(orderId, userId);
  }

  @Post('test-print')
  @Roles('admin', 'manager')
  async testPrint(@Req() req: RequestWithUser) {
    const userId = req.user.userId;
    
    const testOrder = {
      orderNumber: '8888',
      tableNumber: 'Mesa Teste Controller',
      notes: 'Teste via OrdersController',
      paymentStatus: 'PENDING',
      total: 50.00,
      discount: 5,
      items: [
        {
          product: { name: 'Teste Controller' },
          quantity: 2,
          price: 25.00,
        },
      ],
      payments: [],
    };

    const testBranch = {
      branchName: 'Loja Teste Controller',
      address: 'Endereço Teste Controller',
      company: {
        cnpj: '00.000.000/0001-00',
      },
    };

    try {
      await this.ordersService.testPrint(testOrder, testBranch);
      return { success: true, message: 'Test print sent from OrdersController' };
    } catch (error) {
      console.error('Test print error:', error instanceof Error ? error.message : String(error));
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  @Post('generate-random-orders')
  async generateRandomOrders(
    @Query('count') count: string = '400',
    @Req() req: RequestWithUser,
  ) {
    const userId = req.user.userId;
    const orderCount = parseInt(count, 10) || 400;
    return this.ordersService.generateRandomOrders(userId, orderCount);
  }
}
