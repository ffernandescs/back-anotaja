export interface TransferTableDto {
  fromTableId: string;
  toTableId: string;
}

export interface MergeTablesDto {
  tableIds: string[];
  targetTableId: string;
  branchId: string;
  customerId?: string;
}
export enum TableStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  RESERVED = 'RESERVED',
  OCCUPIED = 'OCCUPIED',
  CLEANING = 'CLEANING',
  MERGED = 'MERGED',
  AVAILABLE = 'AVAILABLE',
  ALL = 'ALL',
}
