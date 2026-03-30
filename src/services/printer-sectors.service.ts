import { Injectable } from '@nestjs/common';
import { prisma } from '../../lib/prisma';

@Injectable()
export class PrinterSectorService {
  async findAll(userId?: string) {
    if (!userId) {
      throw new Error('UserId é obrigatório');
    }

    // Buscar usuário para obter o branchId atual
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user || !user.branchId) {
      throw new Error('Usuário não está associado a uma filial');
    }

    return prisma.printerSectorConfig.findMany({
      where: { branchId: user.branchId },
      include: {
        printers: {
          select: {
            id: true,
            name: true,
            printerName: true,
            isActive: true,
          }
        }
      },
      orderBy: { order: 'asc' },
    });
  }

  async findOne(id: string) {
    return prisma.printerSectorConfig.findUnique({
      where: { id },
      include: {
        printers: {
          select: {
            id: true,
            name: true,
            printerName: true,
            isActive: true,
          }
        }
      }
    });
  }

  async create(createSectorDto: any, userId: string) {
    const { printerId, ...data } = createSectorDto;
    
    // Buscar usuário para obter o branchId
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user || !user.branchId) {
      throw new Error('Usuário não está associado a uma filial');
    }

    // Verificar se já existe um setor com o mesmo código para esta branch
    const existing = await prisma.printerSectorConfig.findFirst({
      where: {
        branchId: user.branchId,
        OR: [
          { code: data.code },
          { name: data.name },
        ],
      },
    });

    if (existing) {
      throw new Error('Já existe um setor com este nome ou código nesta filial');
    }

    return prisma.printerSectorConfig.create({
      data: {
        ...data,
        branchId: user.branchId,
      },
    });
  }

  async update(id: string, updateSectorDto: any) {
    const { branchId, printerId, ...data } = updateSectorDto;
    
    // Se está associando uma impressora, validar regras 1:1
    if (printerId) {
      // Verificar se a impressora já está associada a outro setor
      const existingPrinterSector = await prisma.printerSectorConfig.findFirst({
        where: {
          printers: {
            some: { id: printerId }
          }
        }
      });
      
      if (existingPrinterSector && existingPrinterSector.id !== id) {
        throw new Error('Esta impressora já está associada a outro setor');
      }
      
      // Verificar se este setor já tem uma impressora associada
      const currentSector = await prisma.printerSectorConfig.findUnique({
        where: { id },
        include: { printers: true }
      });
      
      if (currentSector && currentSector.printers.length > 0) {
        // Se já tem uma impressora, remove a associação antiga
        await prisma.printer.update({
          where: { id: currentSector.printers[0].id },
          data: { sectorConfigId: null }
        });
      }
      
      // Atualizar a impressora para apontar para este setor
      await prisma.printer.update({
        where: { id: printerId },
        data: { sectorConfigId: id }
      });
    }
    
    // Verificar se já existe outro setor com o mesmo nome/código
    if (data.name || data.code) {
      const existing = await prisma.printerSectorConfig.findFirst({
        where: {
          branchId,
          id: { not: id },
          OR: [
            data.name ? { name: data.name } : {},
            data.code ? { code: data.code } : {},
          ].filter((condition: any) => Object.keys(condition).length > 0),
        },
        include: {
          printers: true
        }
      });

      if (existing) {
        throw new Error('Já existe um setor com este nome ou código nesta filial');
      }
    }

    return prisma.printerSectorConfig.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    // Verificar se há impressoras usando este setor
    const printersCount = await prisma.printer.count({
      where: { sectorConfigId: id },
    });

    if (printersCount > 0) {
      throw new Error('Não é possível excluir um setor que está sendo usado por impressoras');
    }

    return prisma.printerSectorConfig.delete({
      where: { id },
    });
  }

  // Criar setores padrão para uma nova filial
  async createDefaultSectors(branchId: string, userId: string) {
    const defaultSectors = [
      { name: 'Geral', code: 'GENERAL', color: '#3B82F6', icon: 'Printer', order: 0 },
      { name: 'Cozinha', code: 'KITCHEN', color: '#F97316', icon: 'ChefHat', order: 1 },
      { name: 'Bar', code: 'BAR', color: '#10B981', icon: 'Cocktail', order: 2 },
      { name: 'Delivery', code: 'DELIVERY', color: '#8B5CF6', icon: 'Truck', order: 3 },
    ];

    for (const sector of defaultSectors) {
      await this.create(sector, userId);
    }

    return this.findAll(userId);
  }
}
