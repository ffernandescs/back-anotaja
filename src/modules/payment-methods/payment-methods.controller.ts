import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Delete,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PaymentMethodsService } from './payment-methods.service';
import {
  BranchAssignPaymentDto,
  CreatePaymentMethodDto,
} from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

interface RequestWithUser extends Request {
  user: { userId: string; role?: string };
}

@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(private readonly service: PaymentMethodsService) {}

  // ✅ Master cria método
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('master')
  create(@Body() dto: CreatePaymentMethodDto, @Req() req: RequestWithUser) {
    return this.service.create(dto, req.user.userId);
  }

  // ✅ Listar todos ativos
  @Get()
  findAll() {
    return this.service.findAll();
  }

  // ✅ Buscar um
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  // ✅ Atualizar
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('master')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentMethodDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.update(id, dto, req.user.userId);
  }

  // ✅ Remover
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('master')
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.service.remove(id, req.user.userId);
  }

  // ✅ Branch associa métodos
  @Post('branch/assign')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager') // Branch users
  assignToBranch(
    @Body() payments: BranchAssignPaymentDto[],
    @Req() req: RequestWithUser,
  ) {
    return this.service.assignToBranch(req.user.userId, payments);
  }

  // ✅ Branch lista métodos associados
  @Get('branch/')
  getBranchPayments(@Req() req: RequestWithUser) {
    return this.service.getBranchPayments(req.user.userId);
  }
}
