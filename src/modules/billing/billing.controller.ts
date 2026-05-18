import { Body, Controller, Post, UseGuards, Req, Get } from '@nestjs/common';
import type { Request } from 'express';
import { getRequestHost } from '../../common/utils/request-host.util';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BillingService } from './billing.service';
import { ChoosePlanDto } from '../plans/dto/choose-plan.dto';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('payment-context')
  async getPaymentContext(@Req() req: RequestWithUser & Request) {
    return this.billingService.getPaymentContext(getRequestHost(req));
  }

  @Get('details')
  async getDetails(@Req() req: RequestWithUser) {
    return this.billingService.getDetails(req.user.userId);
  }

  @Post('confirm-return')
  async confirmReturn(
    @Body() body: { companyId: string },
    @Req() req: RequestWithUser,
  ) {
    return this.billingService.confirmExternalReturn(
      req.user.userId,
      body.companyId,
    );
  }

  @Get('payment-link')
  async getPaymentLink(@Req() req: RequestWithUser & Request) {
    const userId = req.user.userId;
    return this.billingService.portal(userId, getRequestHost(req));
  }

  @Post('checkout')
  async checkout(@Body() body: { companyId: string; planId: string }) {
    return this.billingService.createCheckout(body.companyId, body.planId);
  }

  @Post('choose')
  async choosePlan(
    @Body() payload: ChoosePlanDto,
    @Req() req: RequestWithUser & Request,
  ) {
    return this.billingService.createCheckout(
      payload.planId,
      req.user.userId,
      payload.billingPeriod,
      getRequestHost(req),
    );
  }

  
}
