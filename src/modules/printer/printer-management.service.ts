import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '../../../lib/prisma';
import { Printer, PrinterSector, PrinterStatus } from '@prisma/client';
import { 
  CreatePrinterDto, 
  UpdatePrinterDto, 
  TestPrinterDto, 
  UpdatePrinterStatusDto 
} from './dto/printer.dto';
import { 
  PrinterWithJobs, 
  PrinterStatusResponse, 
  QZTrayPrinter,
  PrintJobData,
  PrinterTestResult 
} from './types/printer.types';

@Injectable()
export class PrinterManagementService {
  private readonly logger = new Logger(PrinterManagementService.name);
  private readonly qzTrayEndpoint = 'https://localhost:8181';

  constructor() {}

  async createPrinter(createPrinterDto: CreatePrinterDto): Promise<Printer> {
    this.logger.log(`Creating printer: ${createPrinterDto.name}`);

    // Verificar se a filial existe
    const branch = await prisma.branch.findUnique({
      where: { id: createPrinterDto.branchId }
    });

    if (!branch) {
      throw new BadRequestException('Branch not found');
    }

    // Verificar se já existe uma impressora com o mesmo nome na filial
    const existingPrinter = await prisma.printer.findFirst({
      where: {
        name: createPrinterDto.name,
        branchId: createPrinterDto.branchId
      }
    });

    if (existingPrinter) {
      throw new BadRequestException('Printer with this name already exists in this branch');
    }

    const printer = await prisma.printer.create({
      data: createPrinterDto
    });

    // Tentar verificar o status inicial da impressora
    await this.updatePrinterStatus(printer.id);

    this.logger.log(`Printer created successfully: ${printer.id}`);
    return printer;
  }

  async getPrintersByBranch(branchId: string): Promise<PrinterWithJobs[]> {
    return prisma.printer.findMany({
      where: { branchId },
      include: {
        printJobs: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getAllPrinters(): Promise<PrinterWithJobs[]> {
    return prisma.printer.findMany({
      include: {
        printJobs: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getPrinterById(id: string): Promise<PrinterWithJobs | null> {
    return prisma.printer.findUnique({
      where: { id },
      include: {
        printJobs: {
          orderBy: { createdAt: 'desc' },
          take: 20
        }
      }
    });
  }

  async updatePrinter(id: string, updatePrinterDto: UpdatePrinterDto): Promise<Printer> {
    this.logger.log(`Updating printer: ${id}`);

    const printer = await prisma.printer.findUnique({
      where: { id }
    });

    if (!printer) {
      throw new NotFoundException('Printer not found');
    }

    // Se estiver atualizando o nome, verificar duplicidade
    if (updatePrinterDto.name && updatePrinterDto.name !== printer.name) {
      const existingPrinter = await prisma.printer.findFirst({
        where: {
          name: updatePrinterDto.name,
          branchId: printer.branchId,
          id: { not: id }
        }
      });

      if (existingPrinter) {
        throw new BadRequestException('Printer with this name already exists in this branch');
      }
    }

    const updatedPrinter = await prisma.printer.update({
      where: { id },
      data: updatePrinterDto
    });

    // Atualizar status se o nome da impressora foi alterado
    if (updatePrinterDto.printerName && updatePrinterDto.printerName !== printer.printerName) {
      await this.updatePrinterStatus(id);
    }

    this.logger.log(`Printer updated successfully: ${id}`);
    return updatedPrinter;
  }

  async deletePrinter(id: string): Promise<void> {
    this.logger.log(`Deleting printer: ${id}`);

    const printer = await prisma.printer.findUnique({
      where: { id }
    });

    if (!printer) {
      throw new NotFoundException('Printer not found');
    }

    // Verificar se há trabalhos de impressão pendentes
    const pendingJobs = await prisma.printJob.count({
      where: {
        printerId: id,
        status: 'PENDING'
      }
    });

    if (pendingJobs > 0) {
      throw new BadRequestException('Cannot delete printer with pending print jobs');
    }

    await prisma.printer.delete({
      where: { id }
    });

    this.logger.log(`Printer deleted successfully: ${id}`);
  }

  async updatePrinterStatus(printerId: string): Promise<PrinterStatusResponse> {
    const printer = await prisma.printer.findUnique({
      where: { id: printerId }
    });

    if (!printer) {
      throw new NotFoundException('Printer not found');
    }

    const statusResponse = await this.checkPrinterStatus(printer.printerName);

    await prisma.printer.update({
      where: { id: printerId },
      data: {
        status: statusResponse.status,
        updatedAt: new Date()
      }
    });

    return {
      printerId,
      ...statusResponse
    };
  }

  async updateAllPrintersStatus(branchId?: string): Promise<PrinterStatusResponse[]> {
    const where = branchId ? { branchId } : {};
    const printers = await prisma.printer.findMany({ where });

    const statusPromises = printers.map(printer => 
      this.updatePrinterStatus(printer.id)
    );

    return Promise.all(statusPromises);
  }

  async updateAllPrintersStatusAllBranches(): Promise<PrinterStatusResponse[]> {
    const printers = await prisma.printer.findMany();

    const statusPromises = printers.map(printer => 
      this.updatePrinterStatus(printer.id)
    );

    return Promise.all(statusPromises);
  }

  async testPrinter(testPrinterDto: TestPrinterDto): Promise<PrinterTestResult> {
    this.logger.log(`Testing printer: ${testPrinterDto.printerId}`);

    const printer = await prisma.printer.findUnique({
      where: { id: testPrinterDto.printerId }
    });

    if (!printer) {
      throw new NotFoundException('Printer not found');
    }

    if (!printer.isActive) {
      throw new BadRequestException('Printer is not active');
    }

    try {
      const testJobData: PrintJobData = {
        orderId: 'TEST-' + Date.now(),
        orderType: 'TEST',
        items: [
          {
            name: 'Item de Teste',
            quantity: 1,
            price: 10.00,
            complements: [
              {
                name: 'Complemento Teste',
                quantity: 1,
                price: 2.00
              }
            ]
          }
        ],
        tableNumber: 'TEST',
        customerName: 'Cliente Teste',
        total: 12.00,
        paymentMethod: 'Dinheiro',
        notes: 'Impressão de teste - ' + new Date().toLocaleString('pt-BR')
      };

      const result = await this.sendToQZTray(printer.printerName, testJobData, printer);

      // Registrar o trabalho de impressão
      await prisma.printJob.create({
        data: {
          printerId: printer.id,
          orderId: testJobData.orderId,
          orderType: testJobData.orderType,
          sector: testPrinterDto.sector || printer.sector,
          copies: 1,
          status: result.success ? 'COMPLETED' : 'ERROR',
          errorMessage: result.error,
          printedAt: result.success ? new Date() : undefined
        }
      });

      return {
        success: result.success,
        message: result.success ? 'Test print sent successfully' : 'Test print failed',
        printerId: printer.id,
        printedAt: result.success ? new Date() : undefined,
        error: result.error
      };

    } catch (error) {
      this.logger.error(`Test print failed for printer ${printer.id}:`, error);
      
      return {
        success: false,
        message: 'Test print failed',
        printerId: printer.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getAvailablePrinters(): Promise<QZTrayPrinter[]> {
    try {
      // Ignorar verificação de certificado autoassinado para QZ Tray
      const response = await fetch(`${this.qzTrayEndpoint}/api/printers`, {
        headers: {
          'User-Agent': 'Node.js Anotaja Backend',
        },
        // Node.js 18+ ignora certificado por padrão em localhost HTTPS
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch available printers: ${response.status} ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      this.logger.error('Failed to get available printers:', error);
      return [];
    }
  }

  private async checkPrinterStatus(printerName: string): Promise<Omit<PrinterStatusResponse, 'printerId'>> {
    try {
      const response = await fetch(`${this.qzTrayEndpoint}/api/status`, {
        headers: {
          'User-Agent': 'Node.js Anotaja Backend',
        },
      });
      if (!response.ok) {
        return {
          status: PrinterStatus.OFFLINE,
          lastChecked: new Date(),
          errorMessage: 'QZ Tray not responding',
          qzTrayInstalled: false
        };
      }

      const status = await response.json();
      const isPrinterAvailable = status.printers?.some((p: any) => p.name === printerName);

      return {
        status: isPrinterAvailable ? PrinterStatus.ONLINE : PrinterStatus.OFFLINE,
        lastChecked: new Date(),
        qzTrayInstalled: true
      };

    } catch (error) {
      return {
        status: PrinterStatus.ERROR,
        lastChecked: new Date(),
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        qzTrayInstalled: false
      };
    }
  }

  private async sendToQZTray(
    printerName: string, 
    jobData: PrintJobData, 
    printer: Printer
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const payload = {
        printer: printerName,
        data: {
          ...jobData,
          copies: printer.copies,
          printComplements: printer.printComplements,
          customMessage: printer.customMessage,
          qrCodeUrl: printer.qrCodeUrl,
          sector: printer.sector
        }
      };

      const response = await fetch(`${this.qzTrayEndpoint}/api/print`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Node.js Anotaja Backend',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || error.message || 'Print request failed');
      }

      return { success: true };

    } catch (error) {
      this.logger.error(`Failed to send print job to QZ Tray:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async createPrintJob(
    printerId: string,
    orderId: string,
    orderType: string,
    sector: PrinterSector,
    copies: number = 1
  ): Promise<void> {
    await prisma.printJob.create({
      data: {
        printerId,
        orderId,
        orderType,
        sector,
        copies,
        status: 'PENDING'
      }
    });
  }

  async updatePrintJobStatus(
    jobId: string,
    status: string,
    errorMessage?: string
  ): Promise<void> {
    await prisma.printJob.update({
      where: { id: jobId },
      data: {
        status,
        errorMessage,
        printedAt: status === 'COMPLETED' ? new Date() : undefined,
        updatedAt: new Date()
      }
    });
  }
}
