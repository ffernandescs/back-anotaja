import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { PaymentMethodsService } from './payment-methods.service';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

@Controller('payment-methods')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentMethodsController {
  constructor(private readonly paymentMethodsService: PaymentMethodsService) {}

  @Get()
  findAll(
    @Req() req: RequestWithUser,
    @Query('forDineIn') forDineIn?: string,
    @Query('forDelivery') forDelivery?: string,
    @Query('isActive') isActive?: string,
  ) {
    console.log(req.user.userId, 'req.user.userId');
    return this.paymentMethodsService.findAll(req.user.userId, {
      forDineIn,
      forDelivery,
      isActive,
    });
  }

  @Post()
  @Roles('admin', 'manager')
  create(@Body() dto: CreatePaymentMethodDto, @Req() req: RequestWithUser) {
    return this.paymentMethodsService.create(dto, req.user.userId);
  }
}
