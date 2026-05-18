import { BillingPeriod, Plan } from '@prisma/client';
import {
  BrandPaymentIntegrationResponse,
} from '../../maste-brands/subscription-payment.types';

export interface BrandCheckoutCompany {
  id: string;
  name: string;
  email: string;
  phone: string;
  document: string;
}

export interface BrandCheckoutInput {
  company: BrandCheckoutCompany;
  plan: Plan;
  billingPeriod: BillingPeriod;
  brandContext: BrandPaymentIntegrationResponse & {
    brandId: string;
    brandName?: string;
    domain?: string | null;
  };
  trialEndsAt: Date | null;
  existingStripeCustomerId?: string | null;
}

export interface BrandCheckoutResult {
  checkoutUrl: string;
  externalCheckoutId?: string;
  externalCustomerId?: string;
  paymentProvider: 'STRIPE' | 'CAKTO' | 'ASAAS';
}
