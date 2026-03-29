import { Printer, PrinterSector, PrinterStatus } from '@prisma/client';

export interface PrinterWithJobs extends Printer {
  printJobs: Array<{
    id: string;
    orderId: string;
    orderType: string;
    sector: PrinterSector;
    copies: number;
    status: string;
    errorMessage?: string | null;
    printedAt?: Date | null;
    createdAt: Date;
  }>;
}

export interface PrinterStatusResponse {
  printerId: string;
  status: PrinterStatus;
  lastChecked: Date;
  errorMessage?: string;
  qzTrayInstalled: boolean;
}

export interface QZTrayPrinter {
  name: string;
  driver: string;
  config?: any;
}

export interface PrintJobData {
  orderId: string;
  orderType: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    complements?: Array<{
      name: string;
      quantity: number;
      price: number;
    }>;
  }>;
  tableNumber?: string;
  customerName?: string;
  total: number;
  paymentMethod?: string;
  notes?: string;
}

export interface PrinterTestResult {
  success: boolean;
  message: string;
  printerId: string;
  printedAt?: Date;
  error?: string;
}
