import { Body, Controller, Post, UseGuards, Req, Get } from '@nestjs/common';
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

  @Get('payment-link')
  async getPaymentLink(@Req() req: RequestWithUser) {
    const userId = req.user.userId;
    return this.billingService.portal(userId);
  }

  @Post('checkout')
  async checkout(@Body() body: { companyId: string; planId: string }) {
    return this.billingService.createCheckout(body.companyId, body.planId);
  }

  @Post('choose')
  async choosePlan(
    @Body() payload: ChoosePlanDto,
    @Req() req: RequestWithUser,
  ) {
    return this.billingService.createCheckout(payload.planId, req.user.userId);
  }

  
}
