import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { prisma } from '../../../lib/prisma';
import { BillingOrchestratorService } from './orchestrator/billing-orchestrator.service';

/**
 * Webhook Asaas — aplica plano pendente quando checkout/pagamento confirmado.
 * Configure a URL no painel Asaas: POST /api/asaas-billing/webhook
 */
@Controller('asaas-billing/webhook')
export class AsaasWebhookController {
  private readonly logger = new Logger(AsaasWebhookController.name);

  constructor(
    private readonly billingOrchestrator: BillingOrchestratorService,
  ) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(
    @Body() payload: Record<string, unknown>,
    @Headers('asaas-access-token') token?: string,
  ) {
    const expected = process.env.ASAAS_WEBHOOK_TOKEN;
    if (expected && token !== expected) {
      this.logger.warn('Token de webhook Asaas inválido');
      return { received: false };
    }

    const event = String(payload.event ?? '');
    const payment = payload.payment as Record<string, unknown> | undefined;
    const checkout = payload.checkout as Record<string, unknown> | undefined;

    const companyId =
      (checkout?.externalReference as string) ||
      (payment?.externalReference as string) ||
      (payload.externalReference as string);

    if (!companyId) {
      return { received: true, skipped: 'no_company_id' };
    }

    const activateEvents = [
      'CHECKOUT_PAID',
      'PAYMENT_CONFIRMED',
      'PAYMENT_RECEIVED',
    ];

    if (!activateEvents.includes(event)) {
      return { received: true, skipped: event };
    }

    const subscription = await prisma.subscription.findUnique({
      where: { companyId },
    });

    if (!subscription) {
      this.logger.warn(`Assinatura não encontrada para company ${companyId}`);
      return { received: true };
    }

    await prisma.subscription.update({
      where: { companyId },
      data: {
        paymentProvider: 'ASAAS',
        externalCheckoutId:
          (checkout?.id as string) ||
          (payment?.checkoutSession as string) ||
          subscription.externalCheckoutId,
      },
    });

    const result =
      await this.billingOrchestrator.commitPendingPlanAfterPayment(companyId);

    this.logger.log(
      `Assinatura ativada via Asaas para company ${companyId} — plano ${result?.planId}`,
    );
    return { received: true, activated: true, planId: result?.planId };
  }
}
