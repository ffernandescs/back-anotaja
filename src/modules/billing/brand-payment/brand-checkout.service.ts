import { BadRequestException, Injectable } from '@nestjs/common';
import { MasterBrandPaymentService } from '../../maste-brands/master.brand-payment.service';
import { AsaasBrandCheckoutService } from './asaas-brand-checkout.service';
import { CaktoBrandCheckoutService } from './cakto-brand-checkout.service';
import type { BrandCheckoutInput, BrandCheckoutResult } from './checkout.types';
import { StripeBrandCheckoutService } from './stripe-brand-checkout.service';

@Injectable()
export class BrandCheckoutService {
  constructor(
    private readonly brandPaymentService: MasterBrandPaymentService,
    private readonly stripeCheckout: StripeBrandCheckoutService,
    private readonly asaasCheckout: AsaasBrandCheckoutService,
    private readonly caktoCheckout: CaktoBrandCheckoutService,
  ) {}

  async resolveBrandContext(requestHost?: string) {
    return this.brandPaymentService.resolveForBilling(requestHost);
  }

  async createCheckout(
    input: Omit<BrandCheckoutInput, 'brandContext'>,
    requestHost?: string,
  ): Promise<BrandCheckoutResult & { brandId: string }> {
    const brandContext = await this.resolveBrandContext(requestHost);
    const fullInput: BrandCheckoutInput = {
      ...input,
      brandContext: {
        ...brandContext,
        brandId: brandContext.brandId,
      },
    };

    let result: BrandCheckoutResult;

    switch (brandContext.provider) {
      case 'STRIPE':
        result = await this.stripeCheckout.createCheckout(fullInput);
        break;
      case 'ASAAS':
        result = await this.asaasCheckout.createCheckout(fullInput);
        break;
      case 'CAKTO':
        result = await this.caktoCheckout.createCheckout(fullInput);
        break;
      default:
        throw new BadRequestException(
          `Provedor de pagamento não suportado: ${brandContext.provider}`,
        );
    }

    return { ...result, brandId: brandContext.brandId };
  }
}
