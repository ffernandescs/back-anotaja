import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrinterManagementService } from './printer-management.service';
import { 
  CreatePrinterDto, 
  UpdatePrinterDto, 
  TestPrinterDto, 
  UpdatePrinterStatusDto 
} from './dto/printer.dto';
import { PrinterWithJobs, PrinterStatusResponse, QZTrayPrinter } from './types/printer.types';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
    branchId?: string;
  };
}

@Controller('printers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PrinterManagementController {
  constructor(private readonly printerManagementService: PrinterManagementService) {}

  @Get()
  async getPrinters(@Req() req: RequestWithUser, @Query('branchId') branchId?: string) {
    const targetBranchId = branchId || req.user.branchId;
    
    if (!targetBranchId) {
      // Se for usuário master sem branchId, buscar todas as impressoras
      if (req.user.role === 'master') {
        return this.printerManagementService.getAllPrinters();
      }
      throw new BadRequestException('Branch ID is required');
    }

    return this.printerManagementService.getPrintersByBranch(targetBranchId);
  }

  @Get('available')
  async getAvailablePrinters(): Promise<QZTrayPrinter[]> {
    return this.printerManagementService.getAvailablePrinters();
  }

  @Get(':id')
  async getPrinterById(@Param('id') id: string): Promise<PrinterWithJobs> {
    const printer = await this.printerManagementService.getPrinterById(id);
    
    if (!printer) {
      throw new NotFoundException('Printer not found');
    }
    
    return printer;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createPrinter(
    @Body() createPrinterDto: CreatePrinterDto,
    @Req() req: RequestWithUser
  ) {
    // Garantir que a impressora seja criada para a filial do usuário
    if (!req.user.branchId) {
      throw new BadRequestException('User must be associated with a branch');
    }

    createPrinterDto.branchId = req.user.branchId;
    return this.printerManagementService.createPrinter(createPrinterDto);
  }

  @Put(':id')
  async updatePrinter(
    @Param('id') id: string,
    @Body() updatePrinterDto: UpdatePrinterDto
  ) {
    return this.printerManagementService.updatePrinter(id, updatePrinterDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deletePrinter(@Param('id') id: string) {
    await this.printerManagementService.deletePrinter(id);
    return { success: true, message: 'Printer deleted successfully' };
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  async updatePrinterStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdatePrinterStatusDto
  ): Promise<PrinterStatusResponse> {
    return this.printerManagementService.updatePrinterStatus(id);
  }

  @Post('status/all')
  @HttpCode(HttpStatus.OK)
  async updateAllPrintersStatus(
    @Req() req: RequestWithUser,
    @Query('branchId') branchId?: string
  ): Promise<PrinterStatusResponse[]> {
    const targetBranchId = branchId || req.user.branchId;
    
    if (!targetBranchId) {
      // Se for usuário master sem branchId, atualizar todas as impressoras
      if (req.user.role === 'master') {
        return this.printerManagementService.updateAllPrintersStatusAllBranches();
      }
      throw new BadRequestException('Branch ID is required');
    }

    return this.printerManagementService.updateAllPrintersStatus(targetBranchId);
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  async testPrinter(@Body() testPrinterDto: TestPrinterDto) {
    return this.printerManagementService.testPrinter(testPrinterDto);
  }

  @Get('status/health')
  async getSystemHealth() {
    try {
      const availablePrinters = await this.printerManagementService.getAvailablePrinters();
      return {
        qzTrayInstalled: availablePrinters.length > 0,
        availablePrinters: availablePrinters.length,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        qzTrayInstalled: false,
        availablePrinters: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  }
}
