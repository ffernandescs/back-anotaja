export type ComplementOptionWithComplement = {
  id: string;
  name: string;
  price: number;
  active: boolean;
  stockControlEnabled: boolean;
  minStock: number | null;
  displayOrder: number | null;
  complementId: string | null;
  createdAt: Date;
  updatedAt: Date;
  complement?: {
    id: string;
    name: string;
    active: boolean;
    displayOrder: number | null;
    createdAt: Date;
    updatedAt: Date;
    minOptions: number;
    maxOptions: number | null;
    required: boolean;
    allowRepeat: boolean;
    productId: string;
    branchId: string;
    product: { id: string; name: string };
  } | null;
};
