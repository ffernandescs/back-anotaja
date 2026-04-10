import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() createCouponDto: CreateCouponDto) {
    return this.couponsService.create(createCouponDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(
    @Query('branchId') branchId?: string,
    @Query('active') active?: string,
    @Request() req?: any,
  ) {
    const isActive =
      active === 'true' ? true : active === 'false' ? false : undefined;
    // Se branchId não for passado na query, usar do usuário autenticado
    const userBranchId = branchId || req?.user?.branchId;
    return this.couponsService.findAll(userBranchId, isActive);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string) {
    return this.couponsService.findOne(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  update(@Param('id') id: string, @Body() updateCouponDto: UpdateCouponDto) {
    return this.couponsService.update(id, updateCouponDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string) {
    return this.couponsService.remove(id);
  }

  @Post('validate')
  validateForStore(
    @Body() data: {
      code: string;
      branchId: string;
      customerId?: string;
      deliveryType?: string;
      paymentMethodId?: string;
      productIds?: string[];
      subtotal: number;
    },
  ) {
    return this.couponsService.validateCouponForStore(data);
  }
}
