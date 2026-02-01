import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import Stripe from 'stripe';
import { StripeService } from '../billing/stripe.service';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

@Controller('subscription')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubscriptionController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly stripeService: StripeService,
  ) {}

  @Post()
  @Roles('admin', 'manager')
  create(
    @Body() createSubscriptionDto: CreateSubscriptionDto,
    @Req() req: RequestWithUser,
  ) {
    return this.subscriptionService.create(
      createSubscriptionDto,
      req.user.userId,
    );
  }

  @Get()
  findAll(@Req() req: RequestWithUser) {
    return this.subscriptionService.findAll(req.user.userId);
  }
  
  @Get('invoices')
  getInvoices(@Req() req: RequestWithUser) {
    return this.subscriptionService.getInvoices(req.user.userId);
  }

  @Get('invoices/:invoiceId/pdf')
  async downloadInvoicePdf(
    @Param('invoiceId') invoiceId: string,
    @Req() req: RequestWithUser,
  ) {
    const pdfBase64 = await this.subscriptionService.downloadInvoicePdf(
      invoiceId,
      req.user.userId,
    );
    
    return {
      pdf: pdfBase64,
      filename: `fatura-${invoiceId}.pdf`,
    };
  }

  @Get('company/:companyId')
  findByCompany(
    @Param('companyId') companyId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.subscriptionService.findByCompany(companyId, req.user.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.subscriptionService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  @Roles('admin', 'manager')
  update(
    @Param('id') id: string,
    @Body() updateSubscriptionDto: UpdateSubscriptionDto,
    @Req() req: RequestWithUser,
  ) {
    return this.subscriptionService.update(
      id,
      updateSubscriptionDto,
      req.user.userId,
    );
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.subscriptionService.remove(id, req.user.userId);
  }

  @Post('verify-payment')
  async verifyPayment(
    @Body('sessionId') sessionId: string,
    @Req() req: RequestWithUser,
  ) {
    if (!sessionId) throw new NotFoundException('SessionId não fornecido');

    // 1️⃣ Recupera session no Stripe
    let session;
    try {
      session =
        await this.stripeService.stripe.checkout.sessions.retrieve(sessionId);
    } catch (err) {
      console.error(err);
      throw new NotFoundException('Session inválida');
    }

    // 2️⃣ Atualiza subscription no banco
    const subscriptionData = await this.subscriptionService.verifyPayment(
      session,
      req.user.userId,
    );

    return subscriptionData;
  }

}
