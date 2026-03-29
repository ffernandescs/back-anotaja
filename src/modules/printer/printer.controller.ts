import {
  Controller,
  Get,
  Post,
  Delete,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrinterService } from './printer.service';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

@Controller('printer')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PrinterController {
  constructor(private readonly printerService: PrinterService) {}

  @Get('status')
  @Roles('admin', 'manager')
  async getStatus() {
    return this.printerService.getPrinterStatus();
  }

  @Get('config')
  @Roles('admin', 'manager')
  async getConfig() {
    return this.printerService.getConfig();
  }

  @Delete('queue')
  @Roles('admin', 'manager')
  @HttpCode(HttpStatus.OK)
  async clearQueue() {
    await this.printerService.clearPrinterQueue();
    return { success: true, message: 'Fila da impressora limpa' };
  }

  @Post('test')
  @Roles('admin', 'manager')
  @HttpCode(HttpStatus.OK)
  async testPrint(@Req() req: RequestWithUser) {
    const testOrder = {
      orderNumber: '9999',
      tableNumber: 'Mesa Teste',
      notes: 'Pedido de teste da impressora',
      paymentStatus: 'PAID',
      total: 100.50,
      discount: 10,
      items: [
        {
          product: { name: 'Item de Teste 1' },
          quantity: 2,
          price: 45.25,
        },
        {
          product: { name: 'Item de Teste 2' },
          quantity: 1,
          price: 20.00,
        },
      ],
      payments: [
        { type: 'Dinheiro', amount: 90.50 },
      ],
    };

    const testBranch = {
      branchName: 'Loja Teste',
      address: 'Endereço de Teste, 123',
      company: {
        cnpj: '00.000.000/0001-00',
      },
    };

    await this.printerService.printOrder(testOrder, testBranch);
    return { success: true, message: 'Pedido de teste enviado para impressão' };
  }
}
