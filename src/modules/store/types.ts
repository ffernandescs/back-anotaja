import { Branch } from 'generated/prisma';

export type BranchWithRelations = Branch & {
  company: { id: string; active: boolean };
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

export type OrderForStock = {
  id: string;
  orderNumber?: number;
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
