import { Injectable } from '@nestjs/common';
import type { SubscriptionPaymentProvider } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import {
  fetchStripeInvoices,
  mapDbInvoiceToDto,
  mapHistoryEntryToDto,
  mergeBillingInvoices,
  type BillingInvoiceDto,
} from './billing-invoices.util';

@Injectable()
export class BillingInvoicesService {
  async listForSubscription(params: {
    subscriptionId: string;
    paymentProvider?: SubscriptionPaymentProvider | null;
    stripeClient?: import('stripe').Stripe | null;
    stripeSubscriptionId?: string | null;
    planName?: string;
    planEffectivePriceCents?: number;
    limit?: number;
  }): Promise<BillingInvoiceDto[]> {
    const {
      subscriptionId,
      paymentProvider,
      stripeClient,
      stripeSubscriptionId,
      planName,
      planEffectivePriceCents,
      limit = 20,
    } = params;

    const isStripeProvider =
      paymentProvider === 'STRIPE' || !paymentProvider;

    const lists: BillingInvoiceDto[][] = [];

    if (isStripeProvider && stripeSubscriptionId && stripeClient) {
      try {
        lists.push(
          await fetchStripeInvoices(stripeClient, stripeSubscriptionId, planName),
        );
      } catch (error) {
        console.warn('Erro ao buscar invoices do Stripe:', error);
      }
    }

    const dbInvoices = await prisma.invoice.findMany({
      where: { subscriptionId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    if (dbInvoices.length > 0) {
      lists.push(dbInvoices.map((inv) => mapDbInvoiceToDto(inv, planName)));
    }

    const historyEntries = await prisma.subscriptionHistory.findMany({
      where: { subscriptionId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { newPlan: { select: { name: true } } },
    });

    const historyInvoices = historyEntries
      .map((entry) =>
        mapHistoryEntryToDto(
          entry,
          paymentProvider ?? undefined,
          planEffectivePriceCents,
        ),
      )
      .filter((inv): inv is BillingInvoiceDto => inv !== null);

    if (historyInvoices.length > 0) {
      lists.push(historyInvoices);
    }

    if (!isStripeProvider && historyInvoices.length === 0 && dbInvoices.length === 0) {
      return [];
    }

    return mergeBillingInvoices(lists, limit);
  }
}
