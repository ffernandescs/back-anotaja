// complement-option-response.dto.ts
export class ComplementSummaryDto {
  id!: string;
  name!: string;
}
export class ComplementOptionResponseDto {
  id!: string;
  name!: string;
  price!: number;
  active!: boolean;
  displayOrder!: number | null;
  branchId!: string;
  createdAt!: Date;
  updatedAt!: Date;
  stockControlEnabled!: boolean;
  minStock!: number | null;
  complement?: ComplementSummaryDto[];
}
