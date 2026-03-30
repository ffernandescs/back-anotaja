import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '../../lib/prisma';

@Injectable()
export class PrintConfigService {
  private readonly logger = new Logger(PrintConfigService.name);

  async findAll(userId: string) {
    // Buscar usuário para obter o branchId
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user || !user.branchId) {
      throw new Error('Usuário não está associado a uma filial');
    }

    return prisma.printConfig.findMany({
      where: { branchId: user.branchId },
      include: {
        printer: {
          select: {
            id: true,
            name: true,
            printerName: true,
          },
        },
        productionPrinter: {
          select: {
            id: true,
            name: true,
            printerName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    return prisma.printConfig.findUnique({
      where: { id },
      include: {
        printer: {
          select: {
            id: true,
            name: true,
            printerName: true,
          },
        },
        productionPrinter: {
          select: {
            id: true,
            name: true,
            printerName: true,
          },
        },
      },
    });
  }

  async create(createPrintConfigDto: any, userId: string) {
    // Buscar usuário para obter o branchId
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user || !user.branchId) {
      throw new Error('Usuário não está associado a uma filial');
    }

    return prisma.printConfig.upsert({
      where: {
        branchId_orderType_copyType: {
          branchId: user.branchId,
          orderType: createPrintConfigDto.orderType,
          copyType: createPrintConfigDto.copyType,
        },
      },
      update: {
        copies: createPrintConfigDto.copies,
        printerId: createPrintConfigDto.printerId || null,
        productionPrinterId: createPrintConfigDto.productionPrinterId || null,
        isActive: createPrintConfigDto.isActive,
      },
      create: {
        orderType: createPrintConfigDto.orderType,
        copyType: createPrintConfigDto.copyType,
        copies: createPrintConfigDto.copies,
        printerId: createPrintConfigDto.printerId || null,
        productionPrinterId: createPrintConfigDto.productionPrinterId || null,
        isActive: createPrintConfigDto.isActive,
        branchId: user.branchId,
      },
    });
  }

  async update(id: string, updatePrintConfigDto: any) {
    const { printerId, productionPrinterId, copies, isActive } = updatePrintConfigDto;
    
    return prisma.printConfig.update({
      where: { id },
      data: {
        ...(printerId !== undefined && { printerId: printerId || null }),
        ...(productionPrinterId !== undefined && { productionPrinterId: productionPrinterId || null }),
        ...(copies !== undefined && { copies }),
        ...(isActive !== undefined && { isActive }),
      },
    });
  }

  async remove(id: string) {
    return prisma.printConfig.delete({
      where: { id },
    });
  }
}
