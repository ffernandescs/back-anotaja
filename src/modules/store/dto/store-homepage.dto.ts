import { BranchAddress, CompanyAddress } from '@prisma/client';
import { Branch } from 'src/modules/branches/entities/branch.entity';
import { PaymentMethod } from 'src/modules/payment-methods/entities/payment-method.entity';

export interface BranchPaymentMethod {
  id: string;
  branchId: string;
  paymentMethodId: string;
  forDineIn: boolean;
  forDelivery: boolean;
  paymentMethod?: PaymentMethod;
}

export interface BranchSchedule {
  id: string;
  day: string;
  open: string;
  close: string;
  closed: boolean;
  date: string | null;
}

export class StoreHomepageDto {
  branch!: {
    id: string;
    name: string;
    address: BranchAddress;
    phone: string;
    email?: string | null;
    subdomain: string;
    logoUrl?: string | null;
    bannerUrl?: string | null;
    primaryColor?: string | null;
    paymentMethods?: BranchPaymentMethod[];
    openingHours?: BranchSchedule[];
    socialMedia?: string | null;
    document?: string | null;
    description?: string | null;
    instagram?: string | null;
    minOrderValue?: number | null;
    checkoutMessage?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    rating?: number | null;
    ratingsCount?: number;
    productsCount: number;
    categoriesCount: number;
  };
  categories!: Array<{
    id: string;
    name: string;
    slug: string;
    image?: string | null;
    featured?: boolean;
    products: Array<{
      id: string;
      name: string;
      description?: string | null;
      price: number;
      promotionalPrice?: number | null;
      promotionalPeriodType?: string | null;
      promotionalStartDate?: string | null;
      promotionalEndDate?: string | null;
      promotionalDays?: string | null;
      image?: string | null;
      featured: boolean;
      active?: boolean;
      stockControlEnabled?: boolean;
      minStock?: number | null;
      rating?: number | null;
      ratingsCount?: number | null;
      installmentConfig?: string | null;
      filterMetadata?: string | null;
      additions: Array<{
        id: string;
        name: string;
        price: number;
        active: boolean;
        minQuantity?: number;
      }>;
      complements: Array<{
        id: string;
        name: string;
        minOptions: number;
        maxOptions: number | null;
        required: boolean;
        allowRepeat: boolean;
        active: boolean;
        displayOrder: number | null;
        options: Array<{
          id: string;
          name: string;
          price: number;
          active: boolean;
          displayOrder: number | null;
        }>;
      }>;
    }>;
    _count: {
      products: number;
    };
  }>;
  orders?: Array<{
    id: string;
    orderNumber?: number | null;
    status: string;
    total: number;
    createdAt: string;
    items: Array<{
      id: string;
      quantity: number;
      product: {
        name: string;
        image?: string | null;
      };
    }>;
  }>;
}
