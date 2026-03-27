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
import { prisma } from '../../../lib/prisma';

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

  @Get('current')
  async getCurrent(@Req() req: RequestWithUser) {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { company: true },
    });

    if (!user || !user.companyId) {
      return { subscription: null };
    }

    return this.subscriptionService.findByCompany(user.companyId, req.user.userId);
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

  @Get(':id/history')
  async getHistory(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.subscriptionService.getSubscriptionHistory(id, req.user.userId);
  }

  @Get('company/:companyId/history')
  async getCompanyHistory(
    @Param('companyId') companyId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.subscriptionService.getCompanySubscriptionHistory(companyId, req.user.userId);
  }

  @Post('verify-payment')
  async verifyPayment(
    @Body('sessionId') sessionId: string,
    @Req() req: RequestWithUser,
  ) {
    // ✅ Validação de entrada
    if (!sessionId) {
      throw new NotFoundException({
        message: 'SessionId não fornecido',
        error: 'MISSING_SESSION_ID',
      });
    }

    // ✅ Validar formato do sessionId
    if (!sessionId.startsWith('cs_')) {
      throw new NotFoundException({
        message: 'Formato de SessionId inválido',
        error: 'INVALID_SESSION_FORMAT',
      });
    }

    // 1️⃣ Recupera session no Stripe com expand para dados completos
    let session;
    try {
      session = await this.stripeService.stripe.checkout.sessions.retrieve(
        sessionId,
        {
          expand: ['subscription', 'customer'],
        },
      );
    } catch (err: any) {
      console.error('❌ Erro ao recuperar session do Stripe:', {
        sessionId,
        error: err.message,
        code: err.code,
      });
      
      throw new NotFoundException({
        message: 'Session não encontrada ou expirada',
        error: 'STRIPE_SESSION_NOT_FOUND',
        details: err.message,
      });
    }

    // ✅ Validar status da session
    if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
      throw new NotFoundException({
        message: 'Pagamento não confirmado',
        error: 'PAYMENT_NOT_CONFIRMED',
        paymentStatus: session.payment_status,
      });
    }

    // ✅ Validar metadata
    if (!session.metadata?.companyId) {
      throw new NotFoundException({
        message: 'Dados da empresa não encontrados na sessão',
        error: 'MISSING_COMPANY_METADATA',
      });
    }

    // 2️⃣ Atualiza subscription no banco e registra histórico
    try {
      const subscriptionData = await this.subscriptionService.verifyPayment(
        session,
        req.user.userId,
      );

      return subscriptionData;
    } catch (err: any) {
      console.error('❌ Erro ao verificar pagamento:', {
        sessionId,
        userId: req.user.userId,
        error: err.message,
      });
      throw err;
    }
  }

}
