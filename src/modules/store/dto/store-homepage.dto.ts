import { CompanyAddress } from 'generated/prisma';

export class StoreHomepageDto {
  company!: {
    id: string;
    name: string;
    email: string;
    phone: string;
  };
  branch!: {
    id: string;
    name: string;
    address: CompanyAddress;
    phone: string;
    email?: string | null;
    subdomain: string;
    logoUrl?: string | null;
    bannerUrl?: string | null;
    primaryColor?: string | null;
    openingHours?: string | null;
    socialMedia?: string | null;
    paymentMethods?: string | null;
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
