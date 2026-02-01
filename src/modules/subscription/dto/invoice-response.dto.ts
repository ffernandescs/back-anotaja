export interface InvoiceResponseDto {
  id: string;
  date: Date;
  amount: number;
  status: 'PAID' | 'PENDING' | 'FAILED' | 'CANCELLED';
  description: string;
  invoiceNumber: string;
  companyId: string;
  subscriptionId: string;
  createdAt: Date;
}
