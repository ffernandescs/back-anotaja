import { Controller, Get, Put, Body, Param, UseGuards } from '@nestjs/common';
import { PaymentGatewaysService, UpdatePaymentGatewayDto } from './payment-gateways.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('payment-gateways')
@UseGuards(JwtAuthGuard)
export class PaymentGatewaysController {
  constructor(private readonly paymentGatewaysService: PaymentGatewaysService) {}

  @Get(':branchId')
  async getGateways(@Param('branchId') branchId: string) {
    return this.paymentGatewaysService.getGatewaysByBranch(branchId);
  }

  @Get(':branchId/:gatewayType')
  async getGateway(
    @Param('branchId') branchId: string,
    @Param('gatewayType') gatewayType: string,
  ) {
    return this.paymentGatewaysService.getGatewayByType(branchId, gatewayType);
  }

  @Put(':branchId/:gatewayType')
  async updateGateway(
    @Param('branchId') branchId: string,
    @Param('gatewayType') gatewayType: string,
    @Body() data: UpdatePaymentGatewayDto,
  ) {
    return this.paymentGatewaysService.updateGateway(branchId, gatewayType, data);
  }
}
