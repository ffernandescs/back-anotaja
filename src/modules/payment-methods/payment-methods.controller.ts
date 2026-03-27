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
import { JwtOwnerAuthGuard } from 'src/common/guards/jwt-owner.guard';
import { Public } from 'src/common/decorators/public.decorator';

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
  async create(@Body() dto: CreatePaymentMethodDto, @Req() req: RequestWithUser) {
    return this.service.create(dto, req.user.userId);
  }

  // ✅ Owner cria método (novos endpoints)
  @Public()
  @Post('owner')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  async createOwner(@Body() dto: CreatePaymentMethodDto) {
    return this.service.create(dto, 'owner');
  }

  @Public()
  @Get('owner')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  async findAllOwner() {
    return this.service.findAll();
  }

  @Public()
  @Get('owner/:id')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  async findOneOwner(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Public()
  @Patch('owner/:id')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  async updateOwner(@Param('id') id: string, @Body() dto: UpdatePaymentMethodDto) {
    return this.service.update(id, dto);
  }

  @Public()
  @Delete('owner/:id')
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  async removeOwner(@Param('id') id: string) {
    return this.service.remove(id, 'owner');
  }

  // ✅ Listar todos os métodos
  @Public()
  @Get()
  @UseGuards(JwtOwnerAuthGuard)
  @Roles('master')
  async findAll() {
    return this.service.findAll();
  }

  // ✅ Listar um método
  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('master')
  async findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  // ✅ Atualizar método
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('master')
  async update(@Param('id') id: string, @Body() dto: UpdatePaymentMethodDto, @Req() req: RequestWithUser) {
    return this.service.update(id, dto, req.user.userId);
  }

  // ✅ Remover método
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('master')
  async remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.service.remove(id, req.user.userId);
  }

  // ✅ Branch associa métodos
  @Post('branch/assign')
  @UseGuards(JwtAuthGuard, RolesGuard)
  assignToBranch(
    @Body() payments: BranchAssignPaymentDto[],
    @Req() req: RequestWithUser,
  ) {
    return this.service.assignToBranch(req.user.userId, payments);
  }

  // ✅ Branch lista métodos associados
  @Get('branch/me')
  @UseGuards(JwtAuthGuard)
  getBranchPayments(@Req() req: RequestWithUser) {
    return this.service.getBranchPayments(req.user.userId);
  }
}
