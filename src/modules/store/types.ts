import { Branch, Company, CompanyAddress } from '@prisma/client';

export type BranchWithRelations = Branch & {
  company: Company & {
    address: CompanyAddress;
  };
  _count: {
    products: number;
    categories: number;
  };
};

export type CategoryWithProductsAndCount = {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  featured: boolean;
  products: {
    id: string;
    name: string;
    description: string | null;
    price: number;
    promotionalPrice: number | null;
    promotionalPeriodType: string | null;
    promotionalStartDate: Date | null;
    promotionalEndDate: Date | null;
    promotionalDays: number | null;
    image: string | null;
    featured: boolean;
    active: boolean;
    stockControlEnabled: boolean;
    minStock: number | null;
    installmentConfig: any;
    filterMetadata: any;
    additions: {
      id: string;
      name: string;
      price: number;
      active: boolean;
      minQuantity: number;
    }[];
    complements: {
      id: string;
      name: string;
      minOptions: number;
      maxOptions: number;
      required: boolean;
      allowRepeat: boolean;
      active: boolean;
      displayOrder: number;
      options: {
        id: string;
        name: string;
        price: number;
        active: boolean;
        displayOrder: number;
      }[];
    }[];
  }[];
  _count: {
    products: number;
  };
};

/**
 * Tipo para pedido usado no registro de estoque
 * Aceita tanto null quanto undefined para compatibilidade com Prisma
 */
export type OrderForStock = {
  id: string;
  orderNumber?: number | null; // Aceita null do Prisma e undefined do código
};

export type LatLng = { lat: number; lng: number };

export type GeoData = { lat: string; lon: string };

export type CepResult = {
  cep: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
};

/**
 * Payload JWT para autenticação
 */
export interface JwtPayload {
  sub?: string;
  userId?: string;
  email?: string;
  role?: string;
  phone?: string;
  branchId?: string;
  companyId?: string;
  iat?: number;
  exp?: number;
}
