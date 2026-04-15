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
  OCCUPIED  = 'OCCUPIED',   // Em uso
  CLOSING   = 'CLOSING',    // Aguardando pagamento
  CLEANING  = 'CLEANING',   // Em limpeza
  CLOSED    = 'CLOSED',     // Disponível
  RESERVED  = 'RESERVED',   // Reservada
  MERGED    = 'MERGED',     // Incorporada a outra mesa
  // Mantidos para compatibilidade — não usar em código novo
  OPEN      = 'OPEN',       // @deprecated → usar OCCUPIED
  AVAILABLE = 'AVAILABLE',  // @deprecated → usar CLOSED
  // Sentinel para queries — nunca persiste no banco
  ALL       = 'ALL',
}
